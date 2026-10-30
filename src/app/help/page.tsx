import Link from "next/link";
import { UserGuideContent } from "@/components/user-guide-content";

export default function HelpPage() {
  return (
    <div className="dispatch-page user-guide-page">
      <header className="dispatch-page-head">
        <div>
          <p className="dispatch-eyebrow">USER GUIDE</p>
          <h1>사용설명서</h1>
          <p>처음 쓰는 분을 위한 Dispatch System 안내입니다. 목차 번호를 따라가면 됩니다.</p>
        </div>
        <div className="dispatch-head-actions">
          <Link className="dispatch-secondary-button" href="/">
            배차 신청으로
          </Link>
          <Link className="dispatch-secondary-button" href="/confirm">
            배차 확정으로
          </Link>
        </div>
      </header>

      <UserGuideContent />
    </div>
  );
}
