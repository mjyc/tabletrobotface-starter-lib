// const norm = (pt) => Math.sqrt(pt.x * pt.x + pt.y * pt.y);

// const rotate = (pt, theta) => ({
//   x: pt.x * Math.cos(theta) - pt.y * Math.sin(theta),
//   y: pt.x * Math.sin(theta) + pt.y * Math.cos(theta)
// });

const extractPoseFeatures = pose => {
  if (
    !pose.keypoints.find(kpt => kpt.part === "nose") ||
    !pose.keypoints.find(kpt => kpt.part === "leftEye") ||
    !pose.keypoints.find(kpt => kpt.part === "rightEye")
  ) {
    return {};
  }

  const ns = pose.keypoints.filter(kpt => kpt.part === "nose")[0].position;
  const le = pose.keypoints.filter(kpt => kpt.part === "leftEye")[0].position;
  const re = pose.keypoints.filter(kpt => kpt.part === "rightEye")[0].position;
  // a point between two eyes
  const bw = {
    x: (le.x + re.x) * 0.5,
    y: (le.y + re.y) * 0.5
  };
  // a vector from the point between two eyes to the right eye
  const vbl = {
    x: le.x - bw.x,
    y: le.y - bw.y
  };
  const faceRotation = Math.atan2(vbl.y, vbl.x);
  const faceAngle = (faceRotation / Math.PI) * 180;

  const vbn = {
    x: ns.x - bw.x,
    y: ns.y - bw.y
  };
  const dvbl = Math.sqrt(Math.pow(vbl.x, 2) + Math.pow(vbl.y, 2));
  const dvbn = Math.sqrt(Math.pow(vbn.x, 2) + Math.pow(vbn.y, 2));
  const noseRotation = Math.acos(
    (vbl.x * vbn.x + vbl.y * vbn.y) / (dvbl * dvbn)
  );
  const noseAngle = ((noseRotation - Math.PI / 2) / Math.PI) * 180;

  return { faceAngle, noseAngle };
};

module.exports = extractPoseFeatures;
