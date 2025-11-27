declare module 'ping' {
	export interface PingConfig {
		timeout?: number;
		deadline?: number;
		min_reply?: number;
		v6?: boolean;
		sourceAddr?: string;
		packetSize?: number;
		extra?: string[];
	}

	export interface PingResponse {
		inputHost: string;
		host: string;
		alive: boolean;
		output: string;
		time: string | number;
		times: number[];
		min: string;
		max: string;
		avg: string;
		stddev: string;
		packetLoss: string;
		numeric_host: string;
	}

	export namespace promise {
		function probe(host: string, config?: PingConfig): Promise<PingResponse>;
	}

	export namespace sys {
		function probe(
			host: string,
			callback: (isAlive: boolean, error: Error | null) => void,
			config?: PingConfig
		): void;
	}
}
