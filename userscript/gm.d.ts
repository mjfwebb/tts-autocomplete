// The parts of the userscript manager API this script uses. Tampermonkey,
// Violentmonkey and Greasemonkey 4 all provide them as GM.*.

interface GmResponse {
  status: number;
  responseText: string;
  finalUrl?: string;
}

interface GmRequest {
  method: 'GET';
  url: string;
  timeout?: number;
  anonymous?: boolean;
  onload?: (response: GmResponse) => void;
  onerror?: () => void;
  ontimeout?: () => void;
}

interface GmApi {
  xmlHttpRequest: (request: GmRequest) => void;
  getValue: (key: string, fallback?: unknown) => Promise<unknown>;
  setValue: (key: string, value: unknown) => Promise<void>;
}

declare const GM: GmApi;
