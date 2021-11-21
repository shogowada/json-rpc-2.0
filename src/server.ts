import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCParams,
  JSONRPC,
  JSONRPCID,
  JSONRPCErrorCode,
  createJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCID,
  JSONRPCErrorResponse,
} from "./models";
import { createLogDeprecationWarning, DefaultErrorCode } from "./internal";

export type SimpleJSONRPCMethod<ServerParams = void> = (
  params: Partial<JSONRPCParams> | undefined,
  serverParams: ServerParams | undefined
) => any;
export type JSONRPCMethod<ServerParams = void> = (
  request: JSONRPCRequest,
  serverParams: ServerParams | undefined
) =>
  | JSONRPCResponsePromise
  | ((serverParams: ServerParams | undefined) => JSONRPCResponsePromise);
export type JSONRPCResponsePromise = PromiseLike<JSONRPCResponse | null>;

export type JSONRPCServerMiddlewareNext<ServerParams> = (
  request: JSONRPCRequest,
  serverParams: ServerParams | undefined
) => JSONRPCResponsePromise;
export type JSONRPCServerMiddleware<ServerParams> = (
  next: JSONRPCServerMiddlewareNext<ServerParams>,
  request: JSONRPCRequest,
  serverParams: ServerParams | undefined
) => JSONRPCResponsePromise;

type NameToMethodDictionary<ServerParams> = {
  [name: string]: JSONRPCMethod<ServerParams>;
};

const createParseErrorResponse = (): JSONRPCResponse =>
  createJSONRPCErrorResponse(null, JSONRPCErrorCode.ParseError, "Parse error");

const createInvalidRequestResponse = (request: any): JSONRPCResponse =>
  createJSONRPCErrorResponse(
    isJSONRPCID(request.id) ? request.id : null,
    JSONRPCErrorCode.InvalidRequest,
    "Invalid Request"
  );

const createMethodNotFoundResponse = (id: JSONRPCID): JSONRPCResponse =>
  createJSONRPCErrorResponse(
    id,
    JSONRPCErrorCode.MethodNotFound,
    "Method not found"
  );

const logHigherOrderFunctionDeprecationWarning = createLogDeprecationWarning(
  `Using a higher order function on JSONRPCServer.addMethod/addMethodAdvanced is deprecated.
Instead of this: jsonRPCServer.addMethod(methodName, (params) => (serverParams) => /* no change here */)
Do this:         jsonRPCServer.addMethod(methodName, (params, serverParams) => /* no change here */)
The old way still works, but we will drop the support in the future.`
);

export class JSONRPCServer<ServerParams = void> {
  private nameToMethodDictionary: NameToMethodDictionary<ServerParams>;
  private middleware: JSONRPCServerMiddleware<ServerParams> | null;

  public mapErrorToJSONRPCErrorResponse: (
    id: JSONRPCID,
    error: any
  ) => JSONRPCErrorResponse = defaultMapErrorToJSONRPCErrorResponse;

  constructor() {
    this.nameToMethodDictionary = {};
    this.middleware = null;
  }

  addMethod(name: string, method: SimpleJSONRPCMethod<ServerParams>): void {
    this.addMethodAdvanced(name, this.toJSONRPCMethod(method));
  }

  private toJSONRPCMethod(
    method: SimpleJSONRPCMethod<ServerParams>
  ): JSONRPCMethod<ServerParams> {
    return (
      request: JSONRPCRequest,
      serverParams: ServerParams
    ): JSONRPCResponsePromise => {
      let response = method(request.params, serverParams);
      if (typeof response === "function") {
        logHigherOrderFunctionDeprecationWarning();
        response = response(serverParams);
      }
      return Promise.resolve(response).then(
        (result: any) => mapResultToJSONRPCResponse(request.id, result),
        (error: any) => {
          console.warn(
            `JSON-RPC method ${request.method} responded an error`,
            error
          );
          return this.mapErrorToJSONRPCErrorResponseIfNecessary(
            request.id,
            error
          );
        }
      );
    };
  }

  addMethodAdvanced(name: string, method: JSONRPCMethod<ServerParams>): void {
    this.nameToMethodDictionary = {
      ...this.nameToMethodDictionary,
      [name]: method,
    };
  }

  receiveJSON(
    json: string,
    serverParams?: ServerParams
  ): PromiseLike<JSONRPCResponse | JSONRPCResponse[] | null> {
    const request: JSONRPCRequest | JSONRPCRequest[] | null =
      this.tryParseRequestJSON(json);
    if (request) {
      return this.receive(request, serverParams);
    } else {
      return Promise.resolve(createParseErrorResponse());
    }
  }

  private tryParseRequestJSON(json: string): JSONRPCRequest | null {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  receive(
    request: JSONRPCRequest,
    serverParams?: ServerParams
  ): PromiseLike<JSONRPCResponse | null>;
  receive(
    request: JSONRPCRequest | JSONRPCRequest[],
    serverParams?: ServerParams
  ): PromiseLike<JSONRPCResponse | JSONRPCResponse[] | null>;
  receive(
    request: JSONRPCRequest | JSONRPCRequest[],
    serverParams?: ServerParams
  ): PromiseLike<JSONRPCResponse | JSONRPCResponse[] | null> {
    if (Array.isArray(request)) {
      return this.receiveMultiple(request, serverParams);
    } else {
      return this.receiveSingle(request, serverParams);
    }
  }

  private receiveMultiple(
    requests: JSONRPCRequest[],
    serverParams?: ServerParams
  ): PromiseLike<JSONRPCResponse | JSONRPCResponse[] | null> {
    return Promise.all(
      requests.map((request) => this.receiveSingle(request, serverParams))
    )
      .then((responses: (JSONRPCResponse | null)[]): JSONRPCResponse[] =>
        responses.filter(isNonNull)
      )
      .then(
        (
          responses: JSONRPCResponse[]
        ): JSONRPCResponse[] | JSONRPCResponse | null => {
          if (responses.length === 1) {
            return responses[0];
          } else if (responses.length) {
            return responses;
          } else {
            return null;
          }
        }
      );
  }

  private receiveSingle(
    request: JSONRPCRequest,
    serverParams?: ServerParams
  ): JSONRPCResponsePromise {
    const method = this.nameToMethodDictionary[request.method];

    if (!isJSONRPCRequest(request)) {
      return Promise.resolve(createInvalidRequestResponse(request));
    } else if (method) {
      const response: JSONRPCResponsePromise = this.callMethod(
        method,
        request,
        serverParams
      );
      return response.then((response) => mapResponse(request, response));
    } else if (request.id !== undefined) {
      return Promise.resolve(createMethodNotFoundResponse(request.id));
    } else {
      return Promise.resolve(null);
    }
  }

  applyMiddleware(
    ...middlewares: JSONRPCServerMiddleware<ServerParams>[]
  ): void {
    if (this.middleware) {
      this.middleware = this.combineMiddlewares([
        this.middleware,
        ...middlewares,
      ]);
    } else {
      this.middleware = this.combineMiddlewares(middlewares);
    }
  }

  private combineMiddlewares(
    middlewares: JSONRPCServerMiddleware<ServerParams>[]
  ): JSONRPCServerMiddleware<ServerParams> | null {
    if (!middlewares.length) {
      return null;
    } else {
      return middlewares.reduce(this.middlewareReducer);
    }
  }

  private middlewareReducer(
    prevMiddleware: JSONRPCServerMiddleware<ServerParams>,
    nextMiddleware: JSONRPCServerMiddleware<ServerParams>
  ): JSONRPCServerMiddleware<ServerParams> {
    return (
      next: JSONRPCServerMiddlewareNext<ServerParams>,
      request: JSONRPCRequest,
      serverParams: ServerParams | undefined
    ): JSONRPCResponsePromise => {
      return prevMiddleware(
        (request, serverParams) => nextMiddleware(next, request, serverParams),
        request,
        serverParams
      );
    };
  }

  private callMethod(
    method: JSONRPCMethod<ServerParams>,
    request: JSONRPCRequest,
    serverParams: ServerParams | undefined
  ): JSONRPCResponsePromise {
    const callMethod: JSONRPCServerMiddlewareNext<ServerParams> = (
      request: JSONRPCRequest,
      serverParams: ServerParams | undefined
    ): JSONRPCResponsePromise => {
      let response = method(request, serverParams);
      if (typeof response === "function") {
        logHigherOrderFunctionDeprecationWarning();
        return response(serverParams);
      } else {
        return response;
      }
    };

    const onError = (error: any): JSONRPCResponsePromise => {
      console.warn(
        `An unexpected error occurred while executing "${request.method}" JSON-RPC method:`,
        error
      );
      return Promise.resolve(
        this.mapErrorToJSONRPCErrorResponseIfNecessary(request.id, error)
      );
    };

    try {
      return (this.middleware || noopMiddleware)(
        callMethod,
        request,
        serverParams
      ).then(undefined, onError);
    } catch (error) {
      return onError(error);
    }
  }

  private mapErrorToJSONRPCErrorResponseIfNecessary(
    id: JSONRPCID | undefined,
    error: any
  ): JSONRPCErrorResponse | null {
    if (id !== undefined) {
      return this.mapErrorToJSONRPCErrorResponse(id, error);
    } else {
      return null;
    }
  }
}

const isNonNull = <T>(value: T | null): value is T => value !== null;

const noopMiddleware: JSONRPCServerMiddleware<any> = (
  next,
  request,
  serverParams
) => next(request, serverParams);

const mapResultToJSONRPCResponse = (
  id: JSONRPCID | undefined,
  result: any
): JSONRPCResponse | null => {
  if (id !== undefined) {
    return {
      jsonrpc: JSONRPC,
      id,
      result: result === undefined ? null : result,
    };
  } else {
    return null;
  }
};

const defaultMapErrorToJSONRPCErrorResponse = (
  id: JSONRPCID,
  error: any
): JSONRPCErrorResponse => {
  return createJSONRPCErrorResponse(
    id,
    DefaultErrorCode,
    (error && error.message) || "An unexpected error occurred"
  );
};

const mapResponse = (
  request: JSONRPCRequest,
  response: JSONRPCResponse | null
): JSONRPCResponse | null => {
  if (response) {
    return response;
  } else if (request.id !== undefined) {
    return createJSONRPCErrorResponse(
      request.id,
      JSONRPCErrorCode.InternalError,
      "Internal error"
    );
  } else {
    return null;
  }
};
