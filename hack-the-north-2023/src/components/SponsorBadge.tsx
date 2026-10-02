interface Props {
  sponsorName: string;
  logoSrc: string;
  link: string;
}

export function SponsorBadge({ sponsorName, logoSrc, link }: Props) {
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800">
      <img src={logoSrc} alt="" className="w-5 h-5" aria-hidden="true" />
      <span>Powered by {sponsorName}</span>
    </a>
  );
}
