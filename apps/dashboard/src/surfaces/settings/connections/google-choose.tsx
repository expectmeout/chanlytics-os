/**
 * The connected account's locations, for the owner to choose among when Google returned more than one on Maps (moved
 * from legacy/pages/integrations-real.jsx, decision 0015 step 11).
 */
import { useEffect, useState } from "react";
import type { GoogleLocationDto } from "@chanlytics/contracts";
import { googleVerbs } from "@/legacy-bridge/google";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { canDo, gate, type LegacyFlash } from "../../legacy-verbs";

interface GoogleChooseProps {
  busy: boolean;
  setBusy: (b: boolean) => void;
  flash: (f: LegacyFlash) => void;
  onDisconnect: () => void;
}

export const GoogleChoose = ({ busy, setBusy, flash, onDisconnect }: GoogleChooseProps) => {
  const [places, setPlaces] = useState<GoogleLocationDto[] | null>(null);
  useEffect(() => {
    let on = true;
    void googleVerbs.locations().then((r) => {
      if (on) setPlaces(r.ok ? r.locations : []);
    });
    return () => {
      on = false;
    };
  }, []);
  const owner = canDo("team");
  const choose = async (p: GoogleLocationDto) => {
    if (busy) return;
    setBusy(true);
    const r = await googleVerbs.choose(p.account_name, p.location_name);
    setBusy(false);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        <>
          <b>{p.title}</b> is your listing on Google
          {r.read ? " — every review is on Reports now" : " — the reviews follow within the hour"}.
        </>
      ) : (
        <>{r.message}</>
      ),
    });
  };

  return (
    <div className="set-row set-row-stack" data-testid="google-choose">
      <div className="set-row-info">
        <span className="set-row-label">Which location is this workspace?</span>
        <span className="set-row-hint">
          {places === null
            ? "Reading the locations…"
            : places.length === 0
              ? "No location on Google Maps could be read. Try again, or disconnect and connect the right account."
              : "Pick one; every review of it follows."}
        </span>
      </div>
      {places && places.length > 0 && (
        <div className="setup-places" data-testid="google-places">
          {places.map((p) => (
            <div key={`${p.account_name}/${p.location_name}`} className="setup-place" data-testid="google-place">
              <span className="setup-place-body">
                <span className="setup-place-name">{p.title}</span>
                <span className="setup-place-where">
                  {p.address || "no address on Google"}
                  {p.account_title ? ` · ${p.account_title}` : ""}
                </span>
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void choose(p)}
                disabled={busy}
                data-testid="google-place-choose"
                {...gate("team", "choose the listing")}
              >
                This is it
              </Button>
            </div>
          ))}
        </div>
      )}
      {/* It asks first, through the row's own Confirm, as the row's Disconnect does. It disconnected at once (S17). */}
      {owner && (
        <div className="set-acts">
          <LinkButton onClick={onDisconnect} disabled={busy} data-testid="google-choose-disconnect">
            Disconnect instead
          </LinkButton>
        </div>
      )}
    </div>
  );
};
