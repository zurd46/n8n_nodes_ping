# n8n-nodes-ping

This is an n8n community node package that provides ping functionality to check connectivity to IP addresses and domains.

## Features

### Ping Node
Execute ping operations to check if a host is reachable:
- Ping IP addresses or domain names
- Configure timeout and number of ping attempts
- Get detailed statistics (response time, packet loss, min/max/avg times)

### Ping Trigger Node
Trigger workflows based on ping status:
- **On Status Change**: Trigger when host goes online/offline
- **On Every Poll**: Trigger on every poll interval
- **Only When Offline**: Trigger only when host is unreachable
- **Only When Online**: Trigger only when host is reachable
- **On High Latency**: Trigger when latency exceeds a threshold

## Installation

### Community Nodes (Recommended)
1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `@zurdai/n8n-nodes-ping`
4. Click **Install**

### Manual Installation
```bash
npm install @zurdai/n8n-nodes-ping
```

## Usage

### Ping Node
1. Add the **Ping** node to your workflow
2. Enter the host (IP or domain) to ping
3. Configure options:
   - **Timeout**: How long to wait for response (default: 10s)
   - **Number of Pings**: How many ping requests to send (default: 1)
   - **Include Detailed Output**: Include statistics in output

### Ping Trigger Node
1. Add the **Ping Trigger** node as your workflow trigger
2. Enter the host to monitor
3. Select the trigger mode
4. Configure the poll interval in workflow settings
5. Set additional options as needed

## Output Example

### Ping Node Output
```json
{
  "host": "google.com",
  "alive": true,
  "status": "reachable",
  "responseTime": "14.5 ms",
  "packetLoss": "0.0%",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "details": {
    "numericHost": "142.250.185.46",
    "pingsAttempted": 3,
    "pingsSuccessful": 3,
    "pingsFailed": 0,
    "averageTime": "14.50 ms",
    "minTime": "12.30 ms",
    "maxTime": "16.70 ms"
  }
}
```

### Ping Trigger Output
```json
{
  "host": "example.com",
  "alive": true,
  "status": "online",
  "responseTime": "25.30 ms",
  "responseTimeMs": 25.3,
  "packetLoss": "0.0%",
  "packetLossPercent": 0,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "triggerReason": "Host came online",
  "previousStatus": "offline",
  "newStatus": "online"
}
```

## License

MIT
