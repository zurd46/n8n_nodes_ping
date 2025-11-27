import {
	IPollFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';

import * as ping from 'ping';

export class PingTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ping Trigger',
		name: 'pingTrigger',
		icon: 'file:ping.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["host"]}}',
		description: 'Triggers workflow based on ping status changes or on schedule',
		defaults: {
			name: 'Ping Trigger',
		},
		polling: true,
		inputs: [],
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
				displayName: 'Trigger Mode',
				name: 'triggerMode',
				type: 'options',
				options: [
					{
						name: 'On Status Change',
						value: 'statusChange',
						description: 'Trigger when host status changes (online/offline)',
					},
					{
						name: 'On Every Poll',
						value: 'everyPoll',
						description: 'Trigger on every poll interval',
					},
					{
						name: 'Only When Offline',
						value: 'onlyOffline',
						description: 'Trigger only when host is unreachable',
					},
					{
						name: 'Only When Online',
						value: 'onlyOnline',
						description: 'Trigger only when host is reachable',
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
				default: 100,
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
						description: 'Timeout in seconds for each ping request',
					},
					{
						displayName: 'Number of Pings Per Check',
						name: 'numberOfPings',
						type: 'number',
						default: 3,
						description: 'Number of ping requests per check (for more reliable results)',
					},
					{
						displayName: 'Failure Threshold',
						name: 'failureThreshold',
						type: 'number',
						default: 2,
						description: 'Number of consecutive failures before considering host offline',
					},
					{
						displayName: 'Include Raw Output',
						name: 'includeRawOutput',
						type: 'boolean',
						default: false,
						description: 'Whether to include raw ping command output',
					},
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const host = this.getNodeParameter('host') as string;
		const triggerMode = this.getNodeParameter('triggerMode') as string;
		const options = this.getNodeParameter('options', {}) as {
			timeout?: number;
			numberOfPings?: number;
			failureThreshold?: number;
			includeRawOutput?: boolean;
		};

		const timeout = options.timeout ?? 10;
		const numberOfPings = options.numberOfPings ?? 3;
		const includeRawOutput = options.includeRawOutput ?? false;

		// Get previous state from workflow static data
		const workflowStaticData = this.getWorkflowStaticData('node');
		const previousStatus = workflowStaticData.previousStatus as boolean | undefined;
		const consecutiveFailures = (workflowStaticData.consecutiveFailures as number) || 0;
		const failureThreshold = options.failureThreshold ?? 2;

		// Perform ping checks
		let successCount = 0;
		let totalTime = 0;
		let minTime = Infinity;
		let maxTime = 0;
		let lastOutput = '';
		let numericHost = '';

		for (let i = 0; i < numberOfPings; i++) {
			const result = await ping.promise.probe(host, {
				timeout,
			});

			if (result.alive) {
				successCount++;
				const time = parseFloat(result.time as string) || 0;
				totalTime += time;
				if (time < minTime) minTime = time;
				if (time > maxTime) maxTime = time;
			}

			lastOutput = result.output;
			numericHost = result.numeric_host;
		}

		const isAlive = successCount > 0;
		const avgTime = successCount > 0 ? totalTime / successCount : 0;
		const packetLoss = ((numberOfPings - successCount) / numberOfPings) * 100;

		// Update consecutive failures counter
		let newConsecutiveFailures = consecutiveFailures;
		if (!isAlive) {
			newConsecutiveFailures++;
		} else {
			newConsecutiveFailures = 0;
		}
		workflowStaticData.consecutiveFailures = newConsecutiveFailures;

		// Determine if host is considered offline based on failure threshold
		const isOffline = newConsecutiveFailures >= failureThreshold;
		const currentStatus = !isOffline && isAlive;

		// Build output data
		const outputData: IDataObject = {
			host,
			alive: isAlive,
			status: currentStatus ? 'online' : 'offline',
			responseTime: avgTime > 0 ? `${avgTime.toFixed(2)} ms` : 'N/A',
			responseTimeMs: avgTime,
			packetLoss: `${packetLoss.toFixed(1)}%`,
			packetLossPercent: packetLoss,
			timestamp: new Date().toISOString(),
			triggerReason: '',
			details: {
				numericHost,
				pingsAttempted: numberOfPings,
				pingsSuccessful: successCount,
				pingsFailed: numberOfPings - successCount,
				minTime: minTime !== Infinity ? `${minTime.toFixed(2)} ms` : 'N/A',
				maxTime: maxTime > 0 ? `${maxTime.toFixed(2)} ms` : 'N/A',
				consecutiveFailures: newConsecutiveFailures,
				failureThreshold,
			},
		};

		if (includeRawOutput) {
			(outputData.details as Record<string, unknown>).rawOutput = lastOutput;
		}

		// Determine if we should trigger based on mode
		let shouldTrigger = false;

		switch (triggerMode) {
			case 'statusChange':
				if (previousStatus !== undefined && previousStatus !== currentStatus) {
					shouldTrigger = true;
					outputData.triggerReason = currentStatus
						? 'Host came online'
						: 'Host went offline';
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
					outputData.triggerReason = 'Host is offline';
				}
				break;

			case 'onlyOnline':
				if (currentStatus) {
					shouldTrigger = true;
					outputData.triggerReason = 'Host is online';
				}
				break;

			case 'highLatency':
				const latencyThreshold = this.getNodeParameter('latencyThreshold') as number;
				if (isAlive && avgTime > latencyThreshold) {
					shouldTrigger = true;
					outputData.triggerReason = `High latency detected (${avgTime.toFixed(2)}ms > ${latencyThreshold}ms threshold)`;
					outputData.latencyThreshold = latencyThreshold;
				}
				break;
		}

		// Save current status for next poll
		workflowStaticData.previousStatus = currentStatus;

		if (shouldTrigger) {
			return [[{ json: outputData }]];
		}

		return null;
	}
}
