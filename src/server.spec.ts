import { describe, beforeEach, it } from "mocha";
import { expect } from "chai";
import { JSONRPCServer, JSONRPC } from ".";
import { JSONRPCErrorCode, JSONRPCResponse } from "./models";

describe("JSONRPCServer", () => {
  interface ServerParams {
    userID: string;
  }

  let server: JSONRPCServer<ServerParams>;

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
      server.addMethod(
        "echo",
        ({ text }: Params) => (serverParams?: ServerParams) => {
          if (serverParams) {
            return `${serverParams.userID} said ${text}`;
          } else {
            return text;
          }
        }
      );
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

    describe("receiving a request to the method with user ID", () => {
      beforeEach(() => {
        return server
          .receive(
            {
              jsonrpc: JSONRPC,
              id: 0,
              method: "echo",
              params: { text: "foo" }
            },
            { userID: "bar" }
          )
          .then(givenResponse => (response = givenResponse));
      });

      it("should echo the text with the user ID", () => {
        expect(response).to.deep.equal({
          jsonrpc: JSONRPC,
          id: 0,
          result: "bar said foo"
        });
      });
    });
  });

  describe("responding undefined", () => {
    beforeEach(() => {
      server.addMethod("ack", () => undefined);

      return server
        .receive({ jsonrpc: JSONRPC, id: 0, method: "ack" })
        .then(givenResponse => (response = givenResponse));
    });

    it("should response with null result", () => {
      expect(response).to.deep.equal({
        jsonrpc: JSONRPC,
        id: 0,
        result: null
      });
    });
  });

  describe("throwing", () => {
    beforeEach(() => {
      server.addMethod("throw", () => {
        throw new Error("Test throwing");
      });

      return server
        .receive({ jsonrpc: JSONRPC, id: 0, method: "throw" })
        .then(givenResponse => (response = givenResponse));
    });

    it("should respond error", () => {
      expect(response).to.deep.equal({
        jsonrpc: JSONRPC,
        id: 0,
        error: {
          code: 0,
          message: "Test throwing"
        }
      });
    });
  });

  describe("rejecting", () => {
    beforeEach(() => {
      server.addMethodAdvanced("reject", () =>
        Promise.reject(new Error("Test rejecting"))
      );

      return server
        .receive({ jsonrpc: JSONRPC, id: 0, method: "reject" })
        .then(givenResponse => (response = givenResponse));
    });

    it("should respond error", () => {
      expect(response).to.deep.equal({
        jsonrpc: JSONRPC,
        id: 0,
        error: {
          code: 0,
          message: "Test rejecting"
        }
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
