/**
 * The "Why this matches you" analysis panel.
 *
 * Shows, in order:
 *   1. the headline score and a plain verdict ("Strong match")
 *   2. what works in the student's favour
 *   3. what does not — including the exact skills they are missing
 *   4. an eligibility verdict read from the listing's own text
 *   5. every scoring signal with how many points it contributed
 *
 * Point 3 is the one students actually act on: "Skills you could add: Pandas,
 * PyTorch" turns a rejection into a study plan.
 */
import { useState } from 'react';
import {
  Sparkles,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  TrendingUp,
  Lightbulb,
} from 'lucide-react';

/** Colour for a signal bar based on how strong that signal is. */
function barTone(score) {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.4) return 'bg-primary-500';
  if (score >= 0.2) return 'bg-amber-500';
  return 'bg-slate-300';
}

function verdictTone(score) {
  if (score >= 85) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (score >= 70) return 'text-primary-700 bg-primary-50 border-primary-200';
  if (score >= 55) return 'text-blue-700 bg-blue-50 border-blue-200';
  if (score >= 40) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-slate-700 bg-slate-100 border-slate-200';
}

const ELIGIBILITY_STYLES = {
  eligible: { icon: Check, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  ineligible: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-800' },
  unknown: { icon: GraduationCap, className: 'border-slate-200 bg-slate-50 text-slate-600' },
};

export default function MatchAnalysis({ analysis, engine }) {
  const [showSignals, setShowSignals] = useState(false);

  if (!analysis) return null;

  const {
    score,
    verdict,
    signals = [],
    matchedSkills = [],
    missingSkills = [],
    eligibility,
    strengths = [],
    gaps = [],
    profileUsed = {},
  } = analysis;

  const eligibilityStyle =
    ELIGIBILITY_STYLES[eligibility?.status] || ELIGIBILITY_STYLES.unknown;
  const EligibilityIcon = eligibilityStyle.icon;

  // Sort signals by how much they actually contributed, so the biggest
  // reasons appear first rather than in declaration order.
  const rankedSignals = [...signals].sort((a, b) => b.points - a.points);
  const topContributor = rankedSignals[0];

  return (
    <section className="card border-primary-200 bg-primary-50/40 p-6">
      {/* ------------------------------------------------------- headline */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-primary-600" />
            Why this matches you
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Scored against your skills, interests, branch, year and preferences.
          </p>
        </div>

        <div className={`rounded-xl border px-4 py-2 text-center ${verdictTone(score)}`}>
          <p className="text-2xl font-bold leading-none">{score}%</p>
          <p className="mt-1 text-xs font-medium">{verdict}</p>
        </div>
      </div>

      {/* ------------------------------------------------------ strengths */}
      {strengths.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            In your favour
          </h3>
          <ul className="space-y-2">
            {strengths.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-3 w-3 text-emerald-700" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ----------------------------------------------------------- gaps */}
      {gaps.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
            What would make this a stronger match
          </h3>
          <ul className="space-y-2">
            {gaps.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <X className="h-3 w-3 text-amber-700" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --------------------------------------------------------- skills */}
      {(matchedSkills.length > 0 || missingSkills.length > 0) && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {matchedSkills.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Skills you already have ({matchedSkills.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matchedSkills.map((skill) => (
                  <span key={skill} className="badge bg-emerald-100 text-emerald-800">
                    <Check className="h-3 w-3" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingSkills.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Skills to learn ({missingSkills.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingSkills.map((skill) => (
                  <span key={skill} className="badge border border-dashed border-slate-300 bg-white text-slate-600">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- eligibility */}
      {eligibility && eligibility.status !== 'unknown' && (
        <div className={`mt-5 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 ${eligibilityStyle.className}`}>
          <EligibilityIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">
              {eligibility.status === 'eligible'
                ? 'You look eligible'
                : 'Check the eligibility carefully'}
            </p>
            {eligibility.reason && <p className="mt-0.5 text-xs">{eligibility.reason}</p>}
            <p className="mt-1 text-xs opacity-80">
              Read from the listing&apos;s own eligibility text, so always confirm on the
              official page.
            </p>
          </div>
        </div>
      )}

      {/* --------------------------------------------- signal breakdown */}
      <div className="mt-5 border-t border-primary-200 pt-4">
        <button
          type="button"
          onClick={() => setShowSignals((current) => !current)}
          className="flex w-full items-center justify-between text-xs font-semibold text-primary-700 transition hover:text-primary-800"
        >
          <span>
            How the {score}% was calculated
            {topContributor && ` — biggest factor: ${topContributor.label.toLowerCase()}`}
          </span>
          {showSignals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showSignals && (
          <div className="mt-4 space-y-3">
            {rankedSignals.map((signal) => (
              <div key={signal.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-medium text-slate-700">{signal.label}</p>
                  <p className="shrink-0 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">
                      +{signal.points.toFixed(1)}
                    </span>{' '}
                    of {(signal.weight * 100).toFixed(0)}
                  </p>
                </div>

                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barTone(signal.score)}`}
                    style={{ width: `${Math.min(100, signal.score * 100)}%` }}
                  />
                </div>

                {signal.detail && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{signal.detail}</p>
                )}
              </div>
            ))}

            <p className="pt-2 text-xs leading-relaxed text-slate-500">
              Each signal scores 0&ndash;100% on its own, then counts for a fixed share of the
              total. Text similarity uses <strong>TF-IDF + cosine similarity</strong>; the
              other signals compare your profile fields directly.
              {profileUsed.skills === 0 && (
                <> Add skills to your profile to make this score far more accurate.</>
              )}
            </p>
          </div>
        )}
      </div>

      {engine === 'fallback' && (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          The Python recommendation service is offline, so this came from the built-in backup
          scorer and the detailed breakdown is unavailable.
        </p>
      )}
    </section>
  );
}
