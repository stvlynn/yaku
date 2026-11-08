// Contrast pairs keep the translated sentence identical while changing its article.
export const articleContextFixtures = [
  {
    id: "bank-finance",
    title: "A visit to the loan officer",
    surrounding:
      "Maya needed a business loan. She brought her account statements to meet the loan officer at the branch. After the appointment she deposited a cheque.",
    reviewed:
      "The article describes a visit to a financial institution, not a river.",
    text: "She finally reached the bank.",
    expectedSense: "financial institution",
  },
  {
    id: "bank-river",
    title: "A canoe trip downstream",
    surrounding:
      "Maya paddled her canoe past the reeds. She looked for a dry place beside the river to pull the canoe out of the water. She tied it to a tree and climbed onto the grass.",
    reviewed:
      "The article describes getting out of a canoe at the side of a river, not visiting a financial institution.",
    text: "She finally reached the bank.",
    expectedSense: "river bank",
  },
  {
    id: "pitch-music",
    title: "A singer's rehearsal",
    surrounding:
      "The choir rehearsed a difficult melody. The singer listened to the piano and matched the note exactly. The conductor praised his accurate intonation.",
    reviewed:
      "The article discusses musical notes and accurate vocal intonation, not baseball.",
    text: "His pitch was perfect.",
    expectedSense: "musical pitch",
  },
  {
    id: "pitch-baseball",
    title: "The last inning",
    surrounding:
      "The baseball pitcher stood on the mound. The batter waited at home plate. The ball crossed the strike zone and the batter failed to hit it.",
    reviewed:
      "The article describes a baseball player's throw toward a batter, not musical intonation.",
    text: "His pitch was perfect.",
    expectedSense: "baseball pitch",
  },
];
