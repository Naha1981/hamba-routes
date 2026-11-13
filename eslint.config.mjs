import firebaseSecurityRules from "@firebase/eslint-plugin-security-rules";

export default [
  {
    files: ["firestore.rules"],
    plugins: {
      "@firebase/security-rules": firebaseSecurityRules,
    },
    languageOptions: {
      parser: firebaseSecurityRules.parser,
    },
    rules: {
      ...firebaseSecurityRules.configs.recommended.rules,
    },
  },
];
