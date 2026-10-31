import SignupScreen from "@/auth/SignupScreen";

/**
 * Sign-up: a business name, a work email and a password, then the code that proves the address
 * (src/auth/SignupScreen.tsx, which says why each step is where it is). A lead's own receptionist's link signs up at
 * /preview/<token>/mine, the same screen with its preview read on the server (decision 0079); here there is none.
 */
export default function SignupPage() {
  return <SignupScreen preview={null} />;
}
