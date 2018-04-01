import "mocha";
import { expect } from "chai";
import { JSONRPCServer, JSONRPC } from ".";
import { JSONRPCErrorCode, JSONRPCResponse } from "./models";

describe("JSONRPCServer", () => {
  let server: JSONRPCServer;

  let response: JSONRPCResponse | null;

  beforeEach(() => {
    response = null;

    server = new JSONRPCServer();
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
      beforeEach(() => {
        return server
          .receive({
            jsonrpc: JSONRPC,
            id: 0,
            method: "echo",
            params: { text: "foo" }
          })
          .then(givenResponse => (response = givenResponse));
      });

      it("should echo the text", () => {
        expect(response).to.deep.equal({
          jsonrpc: JSONRPC,
          id: 0,
          result: "foo"
        });
      });
    });
  });

  describe("responding to a notification", () => {
    beforeEach(() => {
      server.addMethod("foo", () => "foo");

      return server
        .receive({ jsonrpc: JSONRPC, method: "foo" })
        .then(givenResponse => (response = givenResponse));
    });

    it("should not respond", () => {
      expect(response).to.be.null;
    });
  });

  describe("error on a notification", () => {
    beforeEach(() => {
      server.addMethod("foo", () => Promise.reject("foo"));

      return server
        .receive({ jsonrpc: JSONRPC, method: "foo" })
        .then(givenResponse => (response = givenResponse));
    });

    it("should not respond", () => {
      expect(response).to.be.null;
    });
  });

  describe("responding null to a request", () => {
    beforeEach(() => {
      server.addMethodAdvanced("foo", () => Promise.resolve(null));

      return server
        .receive({
          jsonrpc: JSONRPC,
          id: 0,
          method: "foo"
        })
        .then(givenResponse => (response = givenResponse));
    });

    it("should respond error", () => {
      expect(response).to.deep.equal({
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
      return server
        .receive({
          jsonrpc: JSONRPC,
          id: 0,
          method: "foo"
        })
        .then(givenResponse => (response = givenResponse));
    });

    it("should respond error", () => {
      expect(response).to.deep.equal({
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
