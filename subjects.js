/**
 * Shared subject/class configuration - Ideal College
 */
const JUNIOR_CLASSES = ["JSS1", "JSS2", "JSS3"];
const SENIOR_CLASSES = ["SSS1", "SSS2", "SSS3"];
const ALL_CLASSES = [...JUNIOR_CLASSES, ...SENIOR_CLASSES];

const JUNIOR_SUBJECTS = [
  "English Language", "Mathematics", "RNV / National Values", "PHE", "Home Economics",
  "Business Studies", "ICT / Data Processing", "Yoruba Language", "Basic Technology",
  "Agricultural Science", "Basic Science", "CCA", "History"
];

const SENIOR_SUBJECTS = [
  "English Language", "Mathematics", "Biology", "Chemistry", "Economics", "Commerce",
  "Computer", "Civic Education", "CRS", "Agricultural Science", "Physics", "Government",
  "Yoruba", "Geography", "Literature in English", "Financial Accounting"
];

function levelForClass(classGrade) {
  if (JUNIOR_CLASSES.includes(classGrade)) return "junior";
  if (SENIOR_CLASSES.includes(classGrade)) return "senior";
  return null;
}

function subjectsForClass(classGrade) {
  const level = levelForClass(classGrade);
  if (level === "junior") return JUNIOR_SUBJECTS;
  if (level === "senior") return SENIOR_SUBJECTS;
  return [];
}

module.exports = { JUNIOR_CLASSES, SENIOR_CLASSES, ALL_CLASSES, JUNIOR_SUBJECTS, SENIOR_SUBJECTS, levelForClass, subjectsForClass };
