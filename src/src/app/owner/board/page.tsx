import { Suspense } from "react";
import BoardPage from "@/routes/owner.board";

export default function Page() {
  return (
    <Suspense>
      <BoardPage />
    </Suspense>
  );
}
