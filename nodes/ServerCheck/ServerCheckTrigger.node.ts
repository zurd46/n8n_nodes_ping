import {
	IPollFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';

import * as net from 'net';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';

interface CheckResult {
	reachable: boolean;
	responseTimeMs: number;
	error?: string;
	statusCode?: number;
	resolvedIp?: string;
}

async function executeHttpCheck(url: string, method: string, timeout: number): Promise<CheckResult> {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const parsedUrl = new URL(url);
		const isHttps = parsedUrl.protocol === 'https:';
		const httpModule = isHttps ? https : http;

		const requestOptions = {
			method,
			hostname: parsedUrl.hostname,
			port: parsedUrl.port || (isHttps ? 443 : 80),
			path: parsedUrl.pathname + parsedUrl.search,
			timeout,
			rejectUnauthorized: false,
		};

		const req = httpModule.request(requestOptions, (res) => {
			const responseTime = Date.now() - startTime;
			resolve({
				reachable: true,
				responseTimeMs: responseTime,
				statusCode: res.statusCode,
			});
			res.resume();
		});

		req.on('timeout', () => {
			req.destroy();
			resolve({
				reachable: false,
				responseTimeMs: timeout,
				error: 'Connection timeout',
			});
		});

		req.on('error', (err) => {
			const responseTime = Date.now() - startTime;
			resolve({
				reachable: false,
				responseTimeMs: responseTime,
				error: err.message,
			});
		});

		req.end();
	});
}

async function executeTcpCheck(host: string, port: number, timeout: number): Promise<CheckResult> {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const socket = new net.Socket();

		socket.setTimeout(timeout);

		socket.on('connect', () => {
			const responseTime = Date.now() - startTime;
			socket.destroy();
			resolve({
				reachable: true,
				responseTimeMs: responseTime,
			});
		});

		socket.on('timeout', () => {
			const responseTime = Date.now() - startTime;
			socket.destroy();
			resolve({
				reachable: false,
				responseTimeMs: responseTime,
				error: 'Connection timeout',
			});
		});

		socket.on('error', (err) => {
			const responseTime = Date.now() - startTime;
			socket.destroy();
			resolve({
				reachable: false,
				responseTimeMs: responseTime,
				error: err.message,
			});
		});

		socket.connect(port, host);
	});
}

async function executeDnsCheck(domain: string, timeout: number): Promise<CheckResult> {
	return new Promise((resolve) => {
		const startTime = Date.now();

		const timeoutId = setTimeout(() => {
			resolve({
				reachable: false,
				responseTimeMs: timeout,
				error: 'DNS lookup timeout',
			});
		}, timeout);

		dns.lookup(domain, (err, address) => {
			clearTimeout(timeoutId);
			const responseTime = Date.now() - startTime;

			if (err) {
				resolve({
					reachable: false,
					responseTimeMs: responseTime,
					error: err.message,
				});
			} else {
				resolve({
					reachable: true,
					responseTimeMs: responseTime,
					resolvedIp: address,
				});
			}
		});
	});
}

export class PingTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Server Check Trigger',
		name: 'pingTrigger',
		icon: 'file:ping.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["checkType"]}} - {{$parameter["triggerMode"]}}',
		description: 'Triggers workflow based on server status via HTTP, TCP or DNS checks',
		defaults: {
			name: 'Server Check Trigger',
		},
		polling: true,
		inputs: [],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Check Type',
				name: 'checkType',
				type: 'options',
				options: [
					{
						name: 'HTTP(S) Check',
						value: 'http',
						description: 'Check if a server responds to HTTP/HTTPS requests',
					},
					{
						name: 'TCP Port Check',
						value: 'tcp',
						description: 'Check if a specific TCP port is open',
					},
					{
						name: 'DNS Resolve',
						value: 'dns',
						description: 'Check if a domain can be resolved via DNS',
					},
				],
				default: 'http',
				description: 'The type of check to perform',
			},
			// HTTP Check Options
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'https://example.com or http://192.168.1.1:8080',
				required: true,
				displayOptions: {
					show: {
						checkType: ['http'],
					},
				},
				description: 'The URL to check (include http:// or https://)',
			},
			{
				displayName: 'Method',
				name: 'httpMethod',
				type: 'options',
				options: [
					{ name: 'GET', value: 'GET' },
					{ name: 'HEAD', value: 'HEAD' },
				],
				default: 'GET',
				displayOptions: {
					show: {
						checkType: ['http'],
					},
				},
				description: 'HTTP method to use',
			},
			// TCP Check Options
			{
				displayName: 'Host',
				name: 'host',
				type: 'string',
				default: '',
				placeholder: 'e.g. 192.168.1.1 or vpn.example.com',
				required: true,
				displayOptions: {
					show: {
						checkType: ['tcp'],
					},
				},
				description: 'The IP address or hostname to check',
			},
			{
				displayName: 'Port',
				name: 'port',
				type: 'number',
				default: 443,
				required: true,
				displayOptions: {
					show: {
						checkType: ['tcp'],
					},
				},
				description: 'The TCP port to check (e.g. 443, 80, 500, 4500, 1194, 51820)',
			},
			// DNS Check Options
			{
				displayName: 'Domain',
				name: 'domain',
				type: 'string',
				default: '',
				placeholder: 'e.g. example.com',
				required: true,
				displayOptions: {
					show: {
						checkType: ['dns'],
					},
				},
				description: 'The domain name to resolve',
			},
			// Trigger Options
			{
				displayName: 'Trigger Mode',
				name: 'triggerMode',
				type: 'options',
				options: [
					{
						name: 'On Status Change',
						value: 'statusChange',
						description: 'Trigger when server status changes (online/offline)',
					},
					{
						name: 'On Every Poll',
						value: 'everyPoll',
						description: 'Trigger on every poll interval',
					},
					{
						name: 'Only When Offline',
						value: 'onlyOffline',
						description: 'Trigger only when server is unreachable',
					},
					{
						name: 'Only When Online',
						value: 'onlyOnline',
						description: 'Trigger only when server is reachable',
					},
					{
						name: 'On High Latency',
						value: 'highLatency',
						description: 'Trigger when latency exceeds threshold',
					},
				],
				default: 'statusChange',
				description: 'When to trigger the workflow',
			},
			{
				displayName: 'Latency Threshold (ms)',
				name: 'latencyThreshold',
				type: 'number',
				default: 1000,
				displayOptions: {
					show: {
						triggerMode: ['highLatency'],
					},
				},
				description: 'Trigger when latency exceeds this value in milliseconds',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Timeout (Seconds)',
						name: 'timeout',
						type: 'number',
						default: 10,
						description: 'Timeout in seconds for each check',
					},
					{
						displayName: 'Failure Threshold',
						name: 'failureThreshold',
						type: 'number',
						default: 2,
						description: 'Number of consecutive failures before considering server offline',
					},
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const checkType = this.getNodeParameter('checkType') as string;
		const triggerMode = this.getNodeParameter('triggerMode') as string;
		const options = this.getNodeParameter('options', {}) as {
			timeout?: number;
			failureThreshold?: number;
		};

		const timeout = (options.timeout ?? 10) * 1000;
		const failureThreshold = options.failureThreshold ?? 2;

		// Get previous state from workflow static data
		const workflowStaticData = this.getWorkflowStaticData('node');
		const previousStatus = workflowStaticData.previousStatus as boolean | undefined;
		const consecutiveFailures = (workflowStaticData.consecutiveFailures as number) || 0;

		// Perform the check based on type
		let checkResult: CheckResult;
		let target = '';

		switch (checkType) {
			case 'http': {
				const url = this.getNodeParameter('url') as string;
				const method = this.getNodeParameter('httpMethod') as string;
				target = url;
				checkResult = await executeHttpCheck(url, method, timeout);
				break;
			}
			case 'tcp': {
				const host = this.getNodeParameter('host') as string;
				const port = this.getNodeParameter('port') as number;
				target = `${host}:${port}`;
				checkResult = await executeTcpCheck(host, port, timeout);
				break;
			}
			case 'dns': {
				const domain = this.getNodeParameter('domain') as string;
				target = domain;
				checkResult = await executeDnsCheck(domain, timeout);
				break;
			}
			default:
				return null;
		}

		// Update consecutive failures counter
		let newConsecutiveFailures = consecutiveFailures;
		if (!checkResult.reachable) {
			newConsecutiveFailures++;
		} else {
			newConsecutiveFailures = 0;
		}
		workflowStaticData.consecutiveFailures = newConsecutiveFailures;

		// Determine if server is considered offline based on failure threshold
		const isOffline = newConsecutiveFailures >= failureThreshold;
		const currentStatus = !isOffline && checkResult.reachable;

		// Build output data
		const outputData: IDataObject = {
			checkType,
			target,
			reachable: checkResult.reachable,
			status: currentStatus ? 'online' : 'offline',
			responseTimeMs: checkResult.responseTimeMs,
			responseTime: `${checkResult.responseTimeMs} ms`,
			timestamp: new Date().toISOString(),
			triggerReason: '',
			details: {
				consecutiveFailures: newConsecutiveFailures,
				failureThreshold,
			},
		};

		if (checkResult.error) {
			outputData.error = checkResult.error;
		}
		if (checkResult.statusCode) {
			outputData.statusCode = checkResult.statusCode;
		}
		if (checkResult.resolvedIp) {
			outputData.resolvedIp = checkResult.resolvedIp;
		}

		// Determine if we should trigger based on mode
		let shouldTrigger = false;

		switch (triggerMode) {
			case 'statusChange':
				if (previousStatus !== undefined && previousStatus !== currentStatus) {
					shouldTrigger = true;
					outputData.triggerReason = currentStatus ? 'Server came online' : 'Server went offline';
					outputData.previousStatus = previousStatus ? 'online' : 'offline';
					outputData.newStatus = currentStatus ? 'online' : 'offline';
				}
				// On first run, always trigger to establish baseline
				if (previousStatus === undefined) {
					shouldTrigger = true;
					outputData.triggerReason = 'Initial status check';
				}
				break;

			case 'everyPoll':
				shouldTrigger = true;
				outputData.triggerReason = 'Scheduled poll';
				break;

			case 'onlyOffline':
				if (!currentStatus) {
					shouldTrigger = true;
					outputData.triggerReason = 'Server is offline';
				}
				break;

			case 'onlyOnline':
				if (currentStatus) {
					shouldTrigger = true;
					outputData.triggerReason = 'Server is online';
				}
				break;

			case 'highLatency': {
				const latencyThreshold = this.getNodeParameter('latencyThreshold') as number;
				if (checkResult.reachable && checkResult.responseTimeMs > latencyThreshold) {
					shouldTrigger = true;
					outputData.triggerReason = `High latency detected (${checkResult.responseTimeMs}ms > ${latencyThreshold}ms threshold)`;
					outputData.latencyThreshold = latencyThreshold;
				}
				break;
			}
		}

		// Save current status for next poll
		workflowStaticData.previousStatus = currentStatus;

		if (shouldTrigger) {
			return [[{ json: outputData }]];
		}

		return null;
	}
}
