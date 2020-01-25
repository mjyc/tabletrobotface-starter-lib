const xs = require("xstream").default;
const dropRepeats = require("xstream/extra/dropRepeats").default;
const pairwise = require("xstream/extra/pairwise").default;

module.exports = {
  default: xs,
  map: (fn, stream) => stream.map(fn),
  mapTo: (val, stream) => stream.mapTo(val),
  filter: (fn, stream) => stream.filter(fn),
  scan: (fn, seed, stream) => stream.fold(fn, seed),
  merge: xs.merge.bind(xs),
  combineLatest: xs.combine.bind(xs),
  startWith: (val, stream) => stream.startWith(val),
  take: (val, stream) => stream.take(val),
  skip: (val, stream) => stream.skip(val),
  distinct: stream => stream.compose(dropRepeats()),
  distinct2: (fn, stream) =>
    stream.compose(dropRepeats((a, b) => fn(a) === fn(b))),
  pairwise: stream => stream.compose(pairwise)
};
