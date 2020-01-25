const { promisify } = require("util");
const ltl = require("ltljs");
const { mockTimeSource } = require("@cycle/time");
const logger = require("./../logger");
const {
  randomDiagram,
  setUpTestingEnvironment,
  runAndRecordEvents,
  eventsToDiagram,
  diagramsToString
} = require("./../test_utils");
const monologue = require("./monologue");

test("spec1", async () => {
  const n =
    typeof process !== "undefined" && typeof process.env.N !== "undefined"
      ? parseInt(process.env.N)
      : 100;
  for (let i = 0; i < n; i++) {
    const interval = 3000; // in msec; used 3000 to match the delay period used in monologue. In general, try to match it with the throttle period used in src/index.js
    const Time = mockTimeSource({ interval });
    const timeToRunTo = 60000; // in msec

    const { actions, sensors, diagrams, values } = setUpTestingEnvironment(
      monologue,
      Time,
      {
        interval,
        timeToRunTo,
        values: {
          a: "Brown bear, brown bear, what do you see?",
          b: "I see a human looking at me.",
          d: "The END"
        }
      }
    );

    const events = await promisify(runAndRecordEvents)(
      Object.assign({}, sensors, actions),
      Time,
      timeToRunTo
    );

    const diagrams2 = {
      sayFinished: eventsToDiagram(events, "sayFinished", interval, values),
      playSoundFinished: eventsToDiagram(
        events,
        "playSoundFinished",
        interval,
        values
      ),
      state: eventsToDiagram(events, "state", interval, values),
      setMessage: eventsToDiagram(events, "setMessage", interval, values),
      say: eventsToDiagram(events, "say", interval, values)
    };

    logger.debug(
      `\ni=${i}\n${diagramsToString(Object.assign({}, diagrams, diagrams2))}`
    );

    // check spec
    const spec = {
      type: "eventually",
      value: {
        type: "and",
        value: [
          "say=a",
          {
            type: "eventually",
            value: {
              type: "and",
              value: [
                "say=b",
                {
                  type: "eventually",
                  value: "say=d"
                }
              ]
            }
          }
        ]
      }
    };
    const out = Object.keys(events).reduce((prev, stamp) => {
      const formula = ltl.evalT(prev, pred => {
        const [name, ch] = pred.split("=");
        return !!events[stamp][name]
          ? events[stamp][name] === values[ch]
          : pred;
      });
      return formula;
    }, spec);
    if (out !== true) {
      logger.error(
        `\ni=${i}\n${diagramsToString(Object.assign({}, diagrams, diagrams2))}`
      );
    }
    expect(out).toBe(true);
  }
});
