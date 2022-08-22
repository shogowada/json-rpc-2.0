export type JSONRPC = "2.0";
export const JSONRPC: JSONRPC = "2.0";

export type JSONRPCID = string | number | null;
export type JSONRPCParams = object | any[];

export const isJSONRPCID = (id: any): id is JSONRPCID =>
  typeof id === "string" || typeof id === "number" || id === null;

export interface JSONRPCRequest {
  jsonrpc: JSONRPC;
  method: string;
  params?: JSONRPCParams;
  id?: JSONRPCID;
}

export type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse;

export interface JSONRPCSuccessResponse {
  jsonrpc: JSONRPC;
  id: JSONRPCID;
  result: any;
  error?: undefined;
}

export interface JSONRPCErrorResponse {
  jsonrpc: JSONRPC;
  id: JSONRPCID;
  result?: undefined;
  error: JSONRPCErrorObject;
}

export const isJSONRPCRequest = (payload: any): payload is JSONRPCRequest => {
  return (
    payload.jsonrpc === JSONRPC &&
    payload.method !== undefined &&
    payload.result === undefined &&
    payload.error === undefined
  );
};

export const isJSONRPCRequests = (
  payload: any
): payload is JSONRPCRequest[] => {
  return Array.isArray(payload) && payload.every(isJSONRPCRequest);
};

export const isJSONRPCResponse = (payload: any): payload is JSONRPCResponse => {
  return (
    payload.jsonrpc === JSONRPC &&
    payload.id !== undefined &&
    (payload.result !== undefined || payload.error !== undefined)
  );
};

export const isJSONRPCResponses = (
  payload: any
): payload is JSONRPCResponse[] => {
  return Array.isArray(payload) && payload.every(isJSONRPCResponse);
};

export interface JSONRPCErrorObject {
  code: number;
  message: string;
  data?: any;
}

export class JSONRPCError extends Error implements JSONRPCErrorObject {
  public code: number;
  public data?: any;

  constructor(code: number, message: string, data?: any) {
    super(message);

    // Manually set the prototype to fix TypeScript issue:
    // https://github.com/Microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, JSONRPCError.prototype);

    this.code = code;
    this.data = data;
  }

  toObject(): JSONRPCErrorObject {
    const obj: JSONRPCErrorObject = {
      code: this.code,
      message: this.message,
    };

    if (this.data) {
      obj.data = this.data;
    }

    return obj;
  }
}

export enum JSONRPCErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
}

export const createJSONRPCErrorResponse = (
  id: JSONRPCID,
  code: number,
  message: string,
  data?: any
): JSONRPCErrorResponse => {
  const error: JSONRPCErrorObject = { code, message };

  if (data) {
    error.data = data;
  }

  return {
    jsonrpc: JSONRPC,
    id,
    error,
  };
};

export const createJSONRPCSuccessResponse = (
  id: JSONRPCID,
  result?: any
): JSONRPCSuccessResponse => {
  return {
    jsonrpc: JSONRPC,
    id,
    result: result ?? null,
  };
};

export const createJSONRPCRequest = (
  id: JSONRPCID,
  method: string,
  params?: JSONRPCParams
): JSONRPCRequest => {
  return {
    jsonrpc: JSONRPC,
    id,
    method,
    params,
  };
};

export const createJSONRPCNotification = (
  method: string,
  params?: JSONRPCParams
): JSONRPCRequest => {
  return {
    jsonrpc: JSONRPC,
    method,
    params,
  };
};

export type ErrorListener = (message: string, data: unknown) => void;
