import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	NodeOperationError,
} from 'n8n-workflow';

import * as net from 'net';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';

async function executeHttpCheck(
	node: IExecuteFunctions,
	itemIndex: number,
	timeout: number,
): Promise<IDataObject> {
	const url = node.getNodeParameter('url', itemIndex) as string;
	const method = node.getNodeParameter('httpMethod', itemIndex) as string;
	const acceptAnyStatus = node.getNodeParameter('acceptAnyStatus', itemIndex) as boolean;

	if (!url) {
		throw new NodeOperationError(node.getNode(), 'URL is required', { itemIndex });
	}

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
			const statusCode = res.statusCode || 0;
			const isReachable = acceptAnyStatus ? true : statusCode >= 200 && statusCode < 400;

			resolve({
				checkType: 'http',
				url,
				method,
				reachable: isReachable,
				status: isReachable ? 'online' : 'offline',
				statusCode,
				statusMessage: res.statusMessage,
				responseTimeMs: responseTime,
				responseTime: `${responseTime} ms`,
				timestamp: new Date().toISOString(),
			});

			res.resume();
		});

		req.on('timeout', () => {
			req.destroy();
			resolve({
				checkType: 'http',
				url,
				method,
				reachable: false,
				status: 'offline',
				error: 'Connection timeout',
				responseTimeMs: timeout,
				responseTime: `${timeout} ms (timeout)`,
				timestamp: new Date().toISOString(),
			});
		});

		req.on('error', (err) => {
			const responseTime = Date.now() - startTime;
			resolve({
				checkType: 'http',
				url,
				method,
				reachable: false,
				status: 'offline',
				error: err.message,
				responseTimeMs: responseTime,
				responseTime: `${responseTime} ms`,
				timestamp: new Date().toISOString(),
			});
		});

		req.end();
	});
}

async function executeTcpCheck(
	node: IExecuteFunctions,
	itemIndex: number,
	timeout: number,
): Promise<IDataObject> {
	const host = node.getNodeParameter('host', itemIndex) as string;
	const port = node.getNodeParameter('port', itemIndex) as number;

	if (!host) {
		throw new NodeOperationError(node.getNode(), 'Host is required', { itemIndex });
	}

	return new Promise((resolve) => {
		const startTime = Date.now();
		const socket = new net.Socket();

		socket.setTimeout(timeout);

		socket.on('connect', () => {
			const responseTime = Date.now() - startTime;
			socket.destroy();
			resolve({
				checkType: 'tcp',
				host,
				port,
				reachable: true,
				status: 'online',
				responseTimeMs: responseTime,
				responseTime: `${responseTime} ms`,
				timestamp: new Date().toISOString(),
			});
		});

		socket.on('timeout', () => {
			const responseTime = Date.now() - startTime;
			socket.destroy();
			resolve({
				checkType: 'tcp',
				host,
				port,
				reachable: false,
				status: 'offline',
				error: 'Connection timeout',
				responseTimeMs: responseTime,
				responseTime: `${responseTime} ms (timeout)`,
				timestamp: new Date().toISOString(),
			});
		});

		socket.on('error', (err) => {
			const responseTime = Date.now() - startTime;
			socket.destroy();
			resolve({
				checkType: 'tcp',
				host,
				port,
				reachable: false,
				status: 'offline',
				error: err.message,
				responseTimeMs: responseTime,
				responseTime: `${responseTime} ms`,
				timestamp: new Date().toISOString(),
			});
		});

		socket.connect(port, host);
	});
}

async function executeDnsCheck(
	node: IExecuteFunctions,
	itemIndex: number,
	timeout: number,
): Promise<IDataObject> {
	const domain = node.getNodeParameter('domain', itemIndex) as string;

	if (!domain) {
		throw new NodeOperationError(node.getNode(), 'Domain is required', { itemIndex });
	}

	return new Promise((resolve) => {
		const startTime = Date.now();

		const timeoutId = setTimeout(() => {
			resolve({
				checkType: 'dns',
				domain,
				reachable: false,
				status: 'offline',
				error: 'DNS lookup timeout',
				responseTimeMs: timeout,
				responseTime: `${timeout} ms (timeout)`,
				timestamp: new Date().toISOString(),
			});
		}, timeout);

		dns.lookup(domain, (err, address, family) => {
			clearTimeout(timeoutId);
			const responseTime = Date.now() - startTime;

			if (err) {
				resolve({
					checkType: 'dns',
					domain,
					reachable: false,
					status: 'offline',
					error: err.message,
					responseTimeMs: responseTime,
					responseTime: `${responseTime} ms`,
					timestamp: new Date().toISOString(),
				});
			} else {
				resolve({
					checkType: 'dns',
					domain,
					reachable: true,
					status: 'online',
					resolvedIp: address,
					ipFamily: `IPv${family}`,
					responseTimeMs: responseTime,
					responseTime: `${responseTime} ms`,
					timestamp: new Date().toISOString(),
				});
			}
		});
	});
}

export class Ping implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Server Check',
		name: 'ping',
		icon: 'file:ping.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["checkType"]}} - {{$parameter["host"]}}',
		description: 'Check server connectivity via HTTP, TCP Port or DNS',
		defaults: {
			name: 'Server Check',
		},
		inputs: ['main'],
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
					{ name: 'POST', value: 'POST' },
				],
				default: 'GET',
				displayOptions: {
					show: {
						checkType: ['http'],
					},
				},
				description: 'HTTP method to use',
			},
			{
				displayName: 'Accept Any Status Code',
				name: 'acceptAnyStatus',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						checkType: ['http'],
					},
				},
				description:
					'Whether to consider the server reachable regardless of HTTP status code (200, 301, 401, 500, etc.)',
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
			// Common Options
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
						description: 'Timeout in seconds for the check',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const checkType = this.getNodeParameter('checkType', i) as string;
				const options = this.getNodeParameter('options', i, {}) as {
					timeout?: number;
				};
				const timeout = (options.timeout ?? 10) * 1000;

				let result: IDataObject;

				switch (checkType) {
					case 'http':
						result = await executeHttpCheck(this, i, timeout);
						break;
					case 'tcp':
						result = await executeTcpCheck(this, i, timeout);
						break;
					case 'dns':
						result = await executeDnsCheck(this, i, timeout);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Unknown check type: ${checkType}`, {
							itemIndex: i,
						});
				}

				returnData.push({
					json: result,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							reachable: false,
							status: 'error',
							error: (error as Error).message,
							timestamp: new Date().toISOString(),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
