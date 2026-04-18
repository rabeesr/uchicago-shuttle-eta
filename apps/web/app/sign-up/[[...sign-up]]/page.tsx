import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center p-6">
      <SignUp />
    </main>
  );
}
