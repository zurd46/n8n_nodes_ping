# n8n-nodes-server-check

n8n community node for server monitoring. Check server connectivity via HTTP, TCP Port or DNS - no ICMP ping required (works even when ping is blocked).

## Features

### Server Check Node
Execute connectivity checks:
- **HTTP(S) Check**: Check if a server responds to HTTP/HTTPS requests (works with any status code)
- **TCP Port Check**: Check if a specific TCP port is open (ideal for VPN servers: 443, 500, 4500, 1194, 51820)
- **DNS Resolve**: Check if a domain can be resolved via DNS

### Server Check Trigger Node
Trigger workflows based on server status:
- **On Status Change**: Trigger when server goes online/offline
- **On Every Poll**: Trigger on every poll interval
- **Only When Offline**: Trigger only when server is unreachable
- **Only When Online**: Trigger only when server is reachable
- **On High Latency**: Trigger when latency exceeds a threshold

## Why not ICMP Ping?

Most servers and firewalls block ICMP ping. This node uses alternative methods that work in 99% of cases:
- HTTP requests work if any web service is running
- TCP port checks work for any open port
- DNS lookups work if the domain is resolvable

## Installation

### Community Nodes (Recommended)
1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `@zurdai/n8n-nodes-server-check`
4. Click **Install**

### Manual Installation
```bash
npm install @zurdai/n8n-nodes-server-check
```

## Usage Examples

### HTTP Check
Check if a web server is responding:
- URL: `https://example.com`
- Method: GET
- Accept Any Status: true (200, 301, 401, 500 all count as "reachable")

### TCP Port Check (VPN Server)
Check if a WireGuard VPN server is reachable:
- Host: `vpn.example.com`
- Port: `51820`

### DNS Check
Check if a domain is resolvable:
- Domain: `example.com`

## Output Examples

### HTTP Check Output
```json
{
  "checkType": "http",
  "url": "https://example.com",
  "method": "GET",
  "reachable": true,
  "status": "online",
  "statusCode": 200,
  "statusMessage": "OK",
  "responseTimeMs": 145,
  "responseTime": "145 ms",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### TCP Port Check Output
```json
{
  "checkType": "tcp",
  "host": "vpn.example.com",
  "port": 51820,
  "reachable": true,
  "status": "online",
  "responseTimeMs": 23,
  "responseTime": "23 ms",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### DNS Check Output
```json
{
  "checkType": "dns",
  "domain": "example.com",
  "reachable": true,
  "status": "online",
  "resolvedIp": "93.184.216.34",
  "ipFamily": "IPv4",
  "responseTimeMs": 12,
  "responseTime": "12 ms",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## License

MIT
