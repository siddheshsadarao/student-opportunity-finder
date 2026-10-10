export default function Brand({ compact = false, inverse = false }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <img src="/brand-logo.png" alt="" width={compact ? 42 : 56} height={compact ? 42 : 56} className={`${compact ? 'h-[42px] w-[42px]' : 'h-14 w-14'} shrink-0 rounded-md bg-white object-contain`} />
      <span className={`min-w-0 ${inverse ? 'text-white' : 'text-slate-900'}`}>
        <span className="block text-[11px] font-medium leading-4">Student</span>
        <span className={`block ${compact ? 'text-[13px]' : 'text-base'} font-semibold leading-5`}>Opportunity Finder</span>
      </span>
    </span>
  );
}
