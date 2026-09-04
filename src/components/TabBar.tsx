import { goToTab } from "../state/nav.ts";
import { SearchIcon, ListIcon } from "./icons.tsx";
import "./TabBar.css";

export function TabBar({ active }: { active: "search" | "browse" }) {
  return (
    <nav className="tabbar">
      <button
        type="button"
        className={active === "search" ? "is-active" : ""}
        aria-label="Search tab"
        aria-current={active === "search" ? "page" : undefined}
        onClick={() => goToTab("search")}
      >
        <SearchIcon />
        <span>Search</span>
      </button>
      <button
        type="button"
        className={active === "browse" ? "is-active" : ""}
        aria-label="Browse tab"
        aria-current={active === "browse" ? "page" : undefined}
        onClick={() => goToTab("browse")}
      >
        <ListIcon />
        <span>Browse</span>
      </button>
    </nav>
  );
}
