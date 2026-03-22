// Maps issueTypes[] from community_reports → threat level + zone radius.
// Backend is the single source of truth for threat classification.
//
// Known app issue types (as of 2026-03-22):
//   Road Issue, Street Lighting, Suspicious Activity, Harassment,
//   Infrastructure, Security, Environmental, Vandalism
//
// Future types to add on frontend: gunshots, assault, armed robbery, etc.

const RED_KEYWORDS = [
  // Current app types
  "harassment",
  // Future types (frontend to add)
  "violence", "violent", "assault", "attack", "armed", "weapon", "gun",
  "knife", "stabbing", "shooting", "gunshot", "murder", "homicide",
  "robbery", "rape", "sexual", "abduction", "kidnapping", "threat",
  "gang", "bomb",
];

const ORANGE_KEYWORDS = [
  // Current app types
  "suspicious", "security", "vandalism",
  // Future types
  "theft", "steal", "stolen", "burglary", "break-in", "breakin",
  "stalking", "stalk", "drug", "drugs", "graffiti", "fire", "arson",
  "mugging",
];

// Yellow (default): Road Issue, Street Lighting, Infrastructure, Environmental
// — and anything not matching red or orange

const THREAT_RADIUS = {
  red:    150,
  orange: 100,
  yellow:  60,
};

function classifyThreat(issueTypes = []) {
  const normalized = issueTypes.map((t) => String(t).toLowerCase().trim());

  const isRed = normalized.some((t) =>
    RED_KEYWORDS.some((kw) => t.includes(kw))
  );
  if (isRed) return { threatLevel: "red", radius: THREAT_RADIUS.red };

  const isOrange = normalized.some((t) =>
    ORANGE_KEYWORDS.some((kw) => t.includes(kw))
  );
  if (isOrange) return { threatLevel: "orange", radius: THREAT_RADIUS.orange };

  return { threatLevel: "yellow", radius: THREAT_RADIUS.yellow };
}

export { classifyThreat, THREAT_RADIUS };
