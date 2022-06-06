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
  error: JSONRPCError;
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

export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
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
  const error: JSONRPCError = { code, message };

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

export type ErrorListener = (message: string, data: unknown) => void;
