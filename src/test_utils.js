const { marblediagram, eventscript, ifttt } = require("speclang");
const xs = require("../src/streams").default;

const randomDiagram = (length, chars) => {
  let diagram = "";
  for (let i = 0; i < length; i++) {
    diagram += chars[Math.floor(Math.random() * chars.length)];
  }
  return diagram;
};

const setUpTestingEnvironment = (
  program,
  Time,
  { interval = 500, timeToRunTo = 60000, values = {} }
) => {
  // Create random inputs

  values = Object.assign(
    {
      t: true,
      f: false,
      e: "", // noface
      l: "left",
      r: "right",
      c: "center"
    },
    values
  );

  // emit one 'true' event onstart
  const length = Math.floor(timeToRunTo / interval) - 1; // number of ticks - 1
  const readyDiagram = `t${Array(length)
    .fill("-")
    .join("")}|`;
  // emit human face direction state change events; allows 'left' -> 'right' (without 'center')
  // emits "e" onstart
  const faceLookingAtDiagram = `${
    randomDiagram(length, ["e", "l", "r", "c"]) // see 'values'
      .split("")
      .reduce(
        (prev, ch) => ({
          l: prev.l !== ch ? ch : prev.l,
          s: `${prev.s}${prev.l !== ch ? ch : "-"}` // remove duplicate to keep state change events only
        }),
        { l: "e", s: "e" } // l: last character, s: output string
      ).s
  }|`;
  // emits "f" onstart
  const isFaceVisibleDiagram = faceLookingAtDiagram
    .slice(1)
    .split("")
    .map(ch => (ch === "-" ? "-" : ch === "|" ? "|" : ch === "e" ? "f" : "t")) // derive face visibility state change events from 'faceLookingAtDiagram'
    .reduce(
      (prev, ch) => ({
        l: prev.l !== ch ? ch : prev.l,
        s: `${prev.s}${prev.l !== ch ? ch : "-"}` // remove duplicates
      }),
      { l: "f", s: "f" } // l: last character, s: output string
    ).s;
  // emits human speaking state change events
  // emits "f" onstart
  const isHumanSpeakingDiagram = `${
    randomDiagram(length, ["t", "f"])
      .split("")
      .reduce(
        (prev, ch) => ({
          l: prev.l !== ch ? ch : prev.l,
          s: `${prev.s}${prev.l !== ch ? ch : "-"}` // remove duplicates
        }),
        { l: "f", s: "f" } // l: last character, s: output string
      ).s
  }|`;

  const diagrams = {
    ready: readyDiagram,
    isFaceVisible: isFaceVisibleDiagram,
    // setting 'headTiltedTo' equal to 'faceLookingAt' is okay because we don't have any programs that use both input streams
    headTiltedTo: faceLookingAtDiagram,
    faceLookingAt: faceLookingAtDiagram,
    isHumanSpeaking: isHumanSpeakingDiagram
  };

  const sensors = {
    Time: {
      delay: (period, stream) => stream.compose(Time.delay(period))
    },
    state: xs.create(),
    ready: Time.diagram(diagrams.ready, values),
    isFaceVisible: Time.diagram(diagrams.isFaceVisible, values),
    headTiltedTo: Time.diagram(diagrams.headTiltedTo, values),
    faceLookingAt: Time.diagram(diagrams.faceLookingAt, values),
    isHumanSpeaking: Time.diagram(diagrams.isHumanSpeaking, values),
    sayFinished: xs.create(),
    playSoundFinished: xs.create()
  };

  // Setup the program
  const actions = program(sensors);

  // Create circular inputs; 'xxxFinished' are delayed by 'interval' amount
  sensors.state.imitate(actions.state || xs.never());
  sensors.sayFinished.imitate(
    (actions.say || xs.never()).compose(Time.delay(interval))
  );
  sensors.playSoundFinished.imitate(
    (actions.playSound || xs.never()).compose(Time.delay(interval))
  );

  return {
    sensors,
    actions,
    diagrams,
    values
  };
};

// example output events:
// {
//   '0': {
//     ready: true,
//     say: 'Brown bear, brown bear, what do you see?',
//     isFaceVisible: false,
//     headTiltedTo: '',
//     faceLookingAt: '',
//     isHumanSpeaking: false
//   },
//   '3000': { ...
const runAndRecordEvents = (streams, Time, callbackOrTimeToRunTo, callback) => {
  const events = {};
  Object.keys(streams)
    .filter(name => name !== "Time")
    .map(name => {
      streams[name].addListener({
        next: x => {
          if (!events[Time._time()]) {
            events[Time._time()] = {};
          }
          events[Time._time()][name] = x;
        }
      });
    });

  typeof callbackOrTimeToRunTo === "function"
    ? Time.run(err => callbackOrTimeToRunTo(err, events))
    : Time.run(err => callback(err, events), callbackOrTimeToRunTo);
};

const eventsToDiagram = (events, name, interval, values) => {
  let diagram = "";
  const stamps = Object.keys(events);
  // may miss some fields in 'events' depends of 'interval'
  for (
    let stamp = 0;
    stamp < parseInt(stamps[stamps.length - 1]) + interval;
    stamp += interval
  ) {
    const val = events[stamp] ? events[stamp][name] : events[stamp];
    const ch = Object.keys(values).find(ch => values[ch] === val) || "-";
    diagram += ch;
  }
  return diagram;
};

const diagramsToString = diagrams => {
  return `
ready            : ${diagrams.ready}
isFaceVisible    : ${diagrams.isFaceVisible}
faceLookingAt    : ${diagrams.faceLookingAt}
headTiltedTo     : ${diagrams.faceLookingAt}
isHumanSpeaking  : ${diagrams.isHumanSpeaking}

sayFinished      : ${diagrams.sayFinished}
playSoundFinished: ${diagrams.playSoundFinished}

state            : ${diagrams.state}
setMessage       : ${diagrams.setMessage}
say              : ${diagrams.say}
`;
};

const marbleToLTLHelper = (ast, values) => {
  return ast.values.length < 2
    ? true
    : ast.values.slice(0, -1).reduceRight((prev, value) => {
        return value === "-"
          ? {
              type: "next",
              value: prev
            }
          : `${ast.desc}=${
              typeof values[value] === "string"
                ? JSON.stringify(values[value])
                : value
            }`;
      }, ast.values[ast.values.length - 1]);
};

// TODO: update values usage
const marbleToLTL = (specStr, values) => {
  const ast = marblediagram.parser.parse(specStr);
  return ast.length === 0
    ? true
    : {
        type: "and",
        value: ast.map(a => marbleToLTLHelper(a, values))
      };
};

// TODO: update actionNames usage
const evscToLTL = (specStr, actionNames = []) => {
  const ast = eventscript.parser.parse(specStr);
  const arr = ast.map(node => `${node.name}=${node.value}`);

  if (arr.length < 2) {
    return arr[0];
  }
  const arrR = arr.slice(0).reverse();
  return arrR.slice(1).reduce((prev, desc) => {
    if (desc === "string" && desc.split("=")[0] in actionNames) {
      // TODO: consider the "offset" case
      return {
        type: "and",
        value: [desc, prev]
      };
    } else {
      return {
        type: "and",
        value: [
          desc,
          {
            type: "eventually",
            value: prev
          }
        ]
      };
    }
  }, arrR[0]);
};

// TODO: update values usage
const iftttToLTLHelper = (ast, values) => {
  return {
    type: "and",
    value: [
      `${ast.condition.desc}=${ast.condition.value}`,
      `${ast.action.desc}=${ast.action.value}`
    ]
  };
};

// TODO: update values usage
const iftttToLTL = (specStr, values) => {
  const ast = ifttt.parser.parse(specStr);
  console.log("ast", ast);
  return ast.length === 0
    ? true
    : {
        type: "and",
        value: ast.map(a => iftttToLTLHelper(a, values))
      };
};

module.exports = {
  randomDiagram,
  setUpTestingEnvironment,
  runAndRecordEvents,
  eventsToDiagram,
  diagramsToString,
  marbleToLTL,
  evscToLTL,
  iftttToLTL
};
