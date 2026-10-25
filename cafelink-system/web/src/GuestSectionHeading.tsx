import type { ReactNode } from "react";
import { Icon } from "./Icons";
import type { IconName } from "./Icons";

export function GuestSectionHeading({ id, icon, title, description, meta, actions }: {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="guest-zone-header">
      <span className="guest-zone-icon"><Icon name={icon} /></span>
      <div className="guest-zone-title">
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      {meta && <div className="guest-zone-meta">{meta}</div>}
      {actions && <div className="guest-zone-actions">{actions}</div>}
    </header>
  );
}
