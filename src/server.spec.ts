import "mocha";
import { expect } from "chai";
import { jsonRPCServer, JSONRPCServer, JSONRPC } from ".";
import { JSONRPCErrorCode, JSONRPCResponse } from "./models";

describe("JSONRPCServer", () => {
  let server: JSONRPCServer;

  let lastResponse: JSONRPCResponse | undefined;
  let resolve: (() => void) | undefined;
  let reject: (() => void) | undefined;

  beforeEach(() => {
    lastResponse = undefined;
    resolve = undefined;
    reject = undefined;

    server = jsonRPCServer(response => {
      lastResponse = response;
      return new Promise((givenResolve, givenReject) => {
        resolve = givenResolve;
        reject = givenReject;
      });
    });
  });

  const waitUntil = (predicate: () => boolean): PromiseLike<void> => {
    return Promise.resolve().then(() => {
      if (!predicate()) {
        return waitUntil(predicate);
      }
    });
  };

  describe("having an echo method", () => {
    type Params = { text: string };

    beforeEach(() => {
      server.addMethod("echo", ({ text }: Params) => text);
    });

    describe("receiving a request to the method", () => {
      let promise: PromiseLike<void>;

      beforeEach(() => {
        promise = server.receive({
          jsonrpc: JSONRPC,
          id: 0,
          method: "echo",
          params: { text: "foo" }
        });

        return waitUntil(() => !!resolve);
      });

      it("should echo the text", () => {
        expect(lastResponse).to.deep.equal({
          jsonrpc: JSONRPC,
          id: 0,
          result: "foo"
        });
      });

      describe("and successfully sending a response", () => {
        beforeEach(() => {
          resolve!();
        });

        it("should resolve the promise", () => {
          return promise;
        });
      });

      describe("but failed to send a response", () => {
        beforeEach(() => {
          reject!();
        });

        it("should reject the promise", () => {
          return promise.then(
            () => Promise.reject("Expected to fail"),
            () => undefined
          );
        });
      });
    });
  });

  describe("responding null to a request", () => {
    beforeEach(() => {
      server.addMethodAdvanced("foo", () => Promise.resolve(null));

      const promise = server.receive({
        jsonrpc: JSONRPC,
        id: 0,
        method: "foo"
      });

      return waitUntil(() => !!resolve)
        .then(() => resolve!())
        .then(() => promise);
    });

    it("should respond error", () => {
      expect(lastResponse).to.deep.equal({
        jsonrpc: JSONRPC,
        id: 0,
        error: {
          code: JSONRPCErrorCode.InternalError,
          message: "Internal error"
        }
      });
    });
  });

  describe("receiving a request to an unknown method", () => {
    beforeEach(() => {
      const promise = server.receive({
        jsonrpc: JSONRPC,
        id: 0,
        method: "foo"
      });

      return waitUntil(() => !!resolve)
        .then(() => resolve!())
        .then(() => promise);
    });

    it("should respond error", () => {
      expect(lastResponse).to.deep.equal({
        jsonrpc: JSONRPC,
        id: 0,
        error: {
          code: JSONRPCErrorCode.MethodNotFound,
          message: "Method not found"
        }
      });
    });
  });
});
