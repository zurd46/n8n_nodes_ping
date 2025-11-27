import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	NodeOperationError,
} from 'n8n-workflow';

import * as ping from 'ping';

export class Ping implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ping',
		name: 'ping',
		icon: 'file:ping.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["host"]}}',
		description: 'Ping an IP address or domain to check connectivity',
		defaults: {
			name: 'Ping',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Host',
				name: 'host',
				type: 'string',
				default: '',
				placeholder: 'e.g. google.com or 8.8.8.8',
				required: true,
				description: 'The IP address or domain name to ping',
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
						description: 'Timeout in seconds for the ping request',
					},
					{
						displayName: 'Number of Pings',
						name: 'numberOfPings',
						type: 'number',
						default: 1,
						description: 'Number of ping requests to send',
					},
					{
						displayName: 'Include Detailed Output',
						name: 'includeDetails',
						type: 'boolean',
						default: true,
						description: 'Whether to include detailed ping statistics in the output',
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
				const host = this.getNodeParameter('host', i) as string;
				const options = this.getNodeParameter('options', i, {}) as {
					timeout?: number;
					numberOfPings?: number;
					includeDetails?: boolean;
				};

				const timeout = options.timeout ?? 10;
				const numberOfPings = options.numberOfPings ?? 1;
				const includeDetails = options.includeDetails ?? true;

				if (!host) {
					throw new NodeOperationError(this.getNode(), 'Host is required', { itemIndex: i });
				}

				const pingResults: ping.PingResponse[] = [];
				let successCount = 0;
				let totalTime = 0;
				let minTime = Infinity;
				let maxTime = 0;

				for (let p = 0; p < numberOfPings; p++) {
					const result = await ping.promise.probe(host, {
						timeout,
					});

					pingResults.push(result);

					if (result.alive) {
						successCount++;
						const time = parseFloat(result.time as string) || 0;
						totalTime += time;
						if (time < minTime) minTime = time;
						if (time > maxTime) maxTime = time;
					}
				}

				const lastResult = pingResults[pingResults.length - 1];
				const avgTime = successCount > 0 ? totalTime / successCount : 0;
				const packetLoss = ((numberOfPings - successCount) / numberOfPings) * 100;

				const outputData: IDataObject = {
					host,
					alive: lastResult.alive,
					status: lastResult.alive ? 'reachable' : 'unreachable',
					responseTime: lastResult.time,
					packetLoss: `${packetLoss.toFixed(1)}%`,
					timestamp: new Date().toISOString(),
				};

				if (includeDetails) {
					outputData.details = {
						numericHost: lastResult.numeric_host,
						pingsAttempted: numberOfPings,
						pingsSuccessful: successCount,
						pingsFailed: numberOfPings - successCount,
						averageTime: avgTime > 0 ? `${avgTime.toFixed(2)} ms` : 'N/A',
						minTime: minTime !== Infinity ? `${minTime.toFixed(2)} ms` : 'N/A',
						maxTime: maxTime > 0 ? `${maxTime.toFixed(2)} ms` : 'N/A',
						output: lastResult.output,
					};
				}

				returnData.push({
					json: outputData,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							host: this.getNodeParameter('host', i, '') as string,
							alive: false,
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
