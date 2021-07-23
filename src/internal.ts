export const createLogDeprecationWarning = (message: string) => {
  let warned = false;
  return () => {
    if (!warned && process.env.NODE_ENV !== "production") {
      console.warn(`Deprecation Warning (json-rpc-2.0): ${message}`);
      warned = true;
    }
  };
};

export const DefaultErrorCode = 0;
