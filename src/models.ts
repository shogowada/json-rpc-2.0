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

export interface JSONRPCResponse {
  jsonrpc: JSONRPC;
  result?: any;
  error?: JSONRPCError;
  id: JSONRPCID;
}

export const isJSONRPCRequest = (payload: any): payload is JSONRPCRequest => {
  return (
    payload.jsonrpc === JSONRPC &&
    payload.method !== undefined &&
    payload.result === undefined &&
    payload.error === undefined
  );
};

export const isJSONRPCResponse = (payload: any): payload is JSONRPCResponse => {
  return (
    payload.jsonrpc === JSONRPC &&
    payload.id !== undefined &&
    (payload.result !== undefined || payload.error !== undefined)
  );
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
  message: string
): JSONRPCResponse => {
  return {
    jsonrpc: JSONRPC,
    id,
    error: {
      code,
      message,
    },
  };
};
