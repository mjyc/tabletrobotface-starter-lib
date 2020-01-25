const logger = {
  log: console.log,
  trace: (...args) => {
    // https://stackoverflow.com/a/57023880
    const caller = new Error().stack
      .split("\n")[2]
      .trim()
      .split(" ")[1];
    const trace =
      typeof process === "undefined" ||
      (typeof process.env.TRACE !== "undefined" &&
        (process.env.TRACE === caller ||
          process.env.TRACE === "true" ||
          process.env.TRACE === "1"));
    console.debug(...args);
  },
  debug: (...args) => {
    // https://stackoverflow.com/a/57023880
    const caller = new Error().stack
      .split("\n")[2]
      .trim()
      .split(" ")[1];
    const debug =
      typeof process === "undefined" ||
      (typeof process.env.DEBUG !== "undefined" &&
        (process.env.DEBUG === caller ||
          process.env.DEBUG === "true" ||
          process.env.DEBUG === "1"));
    debug && console.debug(...args);
  },
  info: console.info,
  warn: console.warn,
  error: console.error
};

module.exports = logger;
