import "mocha";
import { expect } from "chai";
import {
  TypedJSONRPCClient,
  TypedJSONRPCServer,
  TypedJSONRPCServerAndClient,
} from "./interfaces.js";
import { JSONRPCClient } from "./client.js";
import { JSONRPCRequest } from "./models.js";
import { JSONRPCServer } from "./server.js";
import { JSONRPCServerAndClient } from "./server-and-client.js";

describe("interfaces", () => {
  describe("independent server and client", () => {
    type Methods = {
      noArgsNoReturn(): void;
      noArgs(): string;
      objectArgs(params: { foo: string; bar: number }): string;
      arrayArgs(params: [string, number]): string;
    };
    let client: TypedJSONRPCClient<Methods>;
    let server: TypedJSONRPCServer<Methods>;

    beforeEach(() => {
      client = new JSONRPCClient<void>(async (request: JSONRPCRequest) => {
        const response = await server.receive(request);
        if (response) {
          client.receive(response);
        }
      });

      server = new JSONRPCServer<void>();
    });

    describe("calling method with no args no return", () => {
      let noArgsNoReturnCalled: boolean;

      beforeEach(() => {
        noArgsNoReturnCalled = false;

        server.addMethod("noArgsNoReturn", (): void => {
          noArgsNoReturnCalled = true;
        });

        return client.request("noArgsNoReturn");
      });

      it("should call the method", () => {
        expect(noArgsNoReturnCalled).to.be.true;
      });
    });

    describe("calling method with no args", () => {
      let expected: string;
      let actual: string;

      beforeEach(async () => {
        expected = "return value";

        server.addMethod("noArgs", (): string => {
          return expected;
        });

        actual = await client.request("noArgs");
      });

      it("should call the method", () => {
        expect(actual).to.equal(expected);
      });
    });

    describe("calling method with object args", () => {
      let actual: string;

      beforeEach(async () => {
        server.addMethod(
          "objectArgs",
          ({ foo, bar }: { foo: string; bar: number }): string => {
            return `${foo}.${bar}`;
          },
        );

        actual = await client.request("objectArgs", {
          foo: "string value",
          bar: 123,
        });
      });

      it("should call the method", () => {
        expect(actual).to.equal("string value.123");
      });
    });

    describe("calling method with array args", () => {
      let actual: string;

      beforeEach(async () => {
        server.addMethod(
          "arrayArgs",
          ([foo, bar]: [string, number]): string => {
            return `${foo}.${bar}`;
          },
        );

        actual = await client.request("arrayArgs", ["string value", 123]);
      });

      it("should call the method", () => {
        expect(actual).to.equal("string value.123");
      });
    });
  });

  describe("server and client", () => {
    type ServerAMethods = {
      echo(params: { message: string }): string;
    };

    type ServerBMethods = {
      sum(params: { x: number; y: number }): number;
    };

    let serverAndClientA: TypedJSONRPCServerAndClient<
      ServerAMethods,
      ServerBMethods
    >;
    let serverAndClientB: TypedJSONRPCServerAndClient<
      ServerBMethods,
      ServerAMethods
    >;

    beforeEach(() => {
      serverAndClientA = new JSONRPCServerAndClient(
        new JSONRPCServer<void>(),
        new JSONRPCClient<void>((request: JSONRPCRequest) =>
          serverAndClientB.receiveAndSend(request),
        ),
      );

      serverAndClientB = new JSONRPCServerAndClient(
        new JSONRPCServer<void>(),
        new JSONRPCClient<void>((request) =>
          serverAndClientA.receiveAndSend(request),
        ),
      );

      serverAndClientA.addMethod("echo", ({ message }) => message);
      serverAndClientB.addMethod("sum", ({ x, y }) => x + y);
    });

    describe("calling method from server A to B", () => {
      let actual: number;

      beforeEach(async () => {
        actual = await serverAndClientA.request("sum", { x: 1, y: 2 });
      });

      it("should call the method", () => {
        expect(actual).to.equal(3);
      });
    });

    describe("calling method from server B to A", () => {
      let expected: string;
      let actual: string;

      beforeEach(async () => {
        expected = "hello";
        actual = await serverAndClientB.request("echo", { message: expected });
      });

      it("should call the method", () => {
        expect(actual).to.equal(expected);
      });
    });
  });
});
