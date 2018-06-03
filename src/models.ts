export type JSONRPC = "2.0";
export const JSONRPC: JSONRPC = "2.0";

export type JSONRPCID = string | number | null;
export type JSONRPCParams = object | any[];

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
    payload.method !== undefined &&
    payload.result === undefined &&
    payload.error === undefined
  );
};

export const isJSONRPCResponse = (payload: any): payload is JSONRPCResponse => {
  return !isJSONRPCRequest(payload);
};

export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

export const enum JSONRPCErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603
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
      message
    }
  };
};
