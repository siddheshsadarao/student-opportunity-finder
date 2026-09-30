/**
 * The opportunity card used on Discover, Recommended, Saved and the
 * category pages.
 *
 * It shows the organisation logo, title, category, location, work mode,
 * required skills, deadline and -- when the recommendation engine supplied
 * one -- the match percentage with its explanation.
 */
import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  MapPin,
  CalendarDays,
  Building2,
  Sparkles,
  Wifi,
  Users,
  Building,
  Rss,
} from 'lucide-react';
import { deadlineLabel, deadlineTone, formatDate, matchTone } from '../utils/format';
import { getCategoryColor } from '../utils/constants';

const MODE_ICONS = { Remote: Wifi, Hybrid: Users, 'On-site': Building };

export default function OpportunityCard({ opportunity, onToggleSave, saving = false }) {
  const {
    id,
    title,
    organization,
    organizationLogo,
    category,
    location,
    mode,
    skills = [],
    deadline,
    stipend,
    isSaved,
    isDemo,
    matchScore,
    matchReasons = [],
    applicationStatus,
    source,
  } = opportunity;

  const colors = getCategoryColor(category?.color);
  const ModeIcon = MODE_ICONS[mode] || Wifi;

  return (
    <article className="card-hover flex flex-col p-5">
      {/* ---------------------------------------------------------- header */}
      <div className="flex items-start gap-3">
        {organizationLogo ? (
          <img
            src={organizationLogo}
            alt={organization}
            className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover"
          />
        ) : (
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}
          >
            <Building2 className={`h-5 w-5 ${colors.text}`} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <Link
            to={`/opportunities/${id}`}
            className="line-clamp-2 font-semibold text-slate-900 transition hover:text-primary-700"
          >
            {title}
          </Link>
          <p className="mt-0.5 truncate text-sm text-slate-500">{organization}</p>
        </div>

        {/* Save / unsave */}
        {onToggleSave && (
          <button
            type="button"
            onClick={() => onToggleSave(opportunity)}
            disabled={saving}
            className={`shrink-0 rounded-lg p-2 transition ${
              isSaved
                ? 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            } disabled:opacity-50`}
            aria-label={isSaved ? `Remove ${title} from saved` : `Save ${title}`}
            title={isSaved ? 'Remove from saved' : 'Save opportunity'}
          >
            {isSaved ? (
              <BookmarkCheck className="h-5 w-5" />
            ) : (
              <Bookmark className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------ badge row */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className={`badge ${colors.bg} ${colors.text}`}>{category?.name}</span>

        <span className="badge bg-slate-100 text-slate-600">
          <ModeIcon className="h-3 w-3" />
          {mode}
        </span>

        {matchScore != null && (
          <span className={`badge border ${matchTone(matchScore)}`}>
            <Sparkles className="h-3 w-3" />
            {matchScore}% Match
          </span>
        )}

        {isDemo && (
          <span
            className="badge border border-amber-200 bg-amber-50 text-amber-700"
            title="Fictional listing created for this project demo"
          >
            Sample
          </span>
        )}

        {applicationStatus && (
          <span className="badge bg-blue-50 text-blue-700">{applicationStatus}</span>
        )}

        {source && (
          <span className="badge border border-slate-200 bg-white text-slate-500" title="Original data source">
            <Rss className="h-3 w-3" />
            <span className="capitalize">{source.replace(/[-_]/g, ' ')}</span>
          </span>
        )}
      </div>

      {/* ------------------------------------------------- meta + skills */}
      <div className="mt-3.5 space-y-2 text-sm">
        <p className="flex items-center gap-1.5 text-slate-500">
          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{location}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="text-slate-500">{formatDate(deadline)}</span>
          <span className={`font-medium ${deadlineTone(deadline)}`}>
            &middot; {deadlineLabel(deadline)}
          </span>
        </p>
      </div>

      {skills.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {skills.slice(0, 4).map((skill) => (
            <span key={skill} className="badge-skill">
              {skill}
            </span>
          ))}
          {skills.length > 4 && (
            <span className="badge-skill">+{skills.length - 4} more</span>
          )}
        </div>
      )}

      {/* --------------------------------- why the engine recommended it */}
      {matchReasons.length > 0 && (
        <div className="mt-3.5 rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2.5">
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-primary-800">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold">Recommended because </span>
              {matchReasons.slice(0, 2).join(' and ').toLowerCase()}.
            </span>
          </p>
        </div>
      )}

      {/* ------------------------------------------------------- actions */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        <Link to={`/opportunities/${id}`} className="btn-primary btn-sm flex-1">
          View Details
        </Link>
        {onToggleSave && (
          <button
            type="button"
            onClick={() => onToggleSave(opportunity)}
            disabled={saving}
            className="btn-secondary btn-sm"
          >
            {isSaved ? 'Saved' : 'Save'}
          </button>
        )}
      </div>

      {stipend && (
        <p className="mt-2.5 text-xs font-medium text-emerald-700">{stipend}</p>
      )}
    </article>
  );
}
