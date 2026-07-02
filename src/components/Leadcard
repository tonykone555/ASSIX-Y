import React, { useState } from 'react';
import { 
  Globe, 
  Phone, 
  MapPin, 
  ExternalLink, 
  CheckCircle, 
  AlertTriangle, 
  Star, 
  Share2, 
  Sparkles,
  EyeOff,
  Navigation
} from 'lucide-react';
import { Lead } from '../types';

interface LeadCardProps {
  lead: Lead;
  onPushLead: (leadId: string) => void;
  isPushing: boolean;
  serverUrl?: string;
}

const getCategoryVisuals = (sector?: string, businessName?: string) => {
  const name = (businessName || '').toLowerCase();
  const sec = (sector || '').toLowerCase();
  
  if (sec.includes('dent') || name.includes('dent') || name.includes('dental') || name.includes('ortho')) {
    return { icon: '🦷', label: 'Dental Clinic', gradient: 'from-[#0ea5e9]/30 via-[#0A0A0C] to-[#0284c7]/50' };
  }
  if (sec.includes('rest') || sec.includes('food') || name.includes('caf') || name.includes('grill') || name.includes('pizza') || name.includes('bakery') || name.includes('eats') || name.includes('kitchen') || name.includes('restaurant')) {
    return { icon: '🍔', label: 'Food & Dining', gradient: 'from-[#f97316]/30 via-[#0A0A0C] to-[#ea580c]/50' };
  }
  if (sec.includes('fit') || sec.includes('gym') || name.includes('crossfit') || name.includes('yoga') || name.includes('sport') || name.includes('athletic') || name.includes('fitness')) {
    return { icon: '🏋️', label: 'Fitness & Gym', gradient: 'from-[#a855f7]/30 via-[#0A0A0C] to-[#7c3aed]/50' };
  }
  if (sec.includes('real') || sec.includes('home') || name.includes('realt') || name.includes('agent') || name.includes('propert') || name.includes('estate')) {
    return { icon: '🏡', label: 'Real Estate', gradient: 'from-[#10b981]/30 via-[#0A0A0C] to-[#059669]/50' };
  }
  if (sec.includes('salon') || sec.includes('spa') || name.includes('hair') || name.includes('beauty') || name.includes('barber') || name.includes('nails')) {
    return { icon: '💇', label: 'Beauty & Salon', gradient: 'from-[#ec4899]/30 via-[#0A0A0C] to-[#db2777]/50' };
  }
  if (sec.includes('auto') || sec.includes('car') || name.includes('garage') || name.includes('motor') || name.includes('repair') || name.includes('tire')) {
    return { icon: '🚗', label: 'Automotive', gradient: 'from-[#64748b]/30 via-[#0A0A0C] to-[#475569]/50' };
  }
  return { icon: '🏢', label: 'Local Business', gradient: 'from-[#6366f1]/30 via-[#0A0A0C] to-[#4f46e5]/50' };
};

export const LeadCard: React.FC<LeadCardProps> = ({ 
  lead, 
  onPushLead, 
  isPushing, 
  serverUrl 
}) => {
  const [copiedPhone, setCopiedPhone] = useState(false);

  const handleCopyPhone = () => {
    if (lead.phone) {
      navigator.clipboard.writeText(lead.phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const domain = lead.website ? lead.website.replace(/https?:\/\/|www\./g, '') : '';
  const visuals = getCategoryVisuals(lead.sector || lead.leadType, lead.businessName);

  return (
    <div className="bg-[#0F0F11] border border-[#1C1C1F] hover:border-[#6366F1]/40 rounded-lg overflow-hidden transition-all duration-300 flex flex-col h-full group shadow-md hover:shadow-[0_8px_24px_rgba(99,102,241,0.06)] relative select-none">
      
      {/* CARD IMAGE VISUAL PREVIEW */}
      <div className="relative h-28 bg-[#09090B] border-b border-[#1C1C1F] overflow-hidden flex items-center justify-center select-none shrink-0">
        {lead.leadType === 'has_website' ? (
          /* STYLIZED WEBSITE PREVIEW WIREFRAME */
          <div className={`absolute inset-0 p-3 flex flex-col justify-between bg-gradient-to-br ${visuals.gradient}`}>
            <div className="flex items-center justify-between">
              {/* Browser window head */}
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]/40" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]/40" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]/40" />
              </div>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[7px] font-extrabold tracking-widest px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                <span className="text-[10px] leading-none">{visuals.icon}</span> {visuals.label}
              </span>
            </div>

            {/* Simulated Address Bar */}
            <div className="w-full bg-[#141416]/90 text-[8px] text-[#A1A1AA] font-mono px-2.5 py-1 rounded border border-[#222225] flex items-center gap-1.5 truncate shadow-sm my-1.5">
              <Globe size={9} className="text-[#6366F1]" />
              <span className="truncate">{domain || 'domain.com'}</span>
            </div>

            {/* Wireframe Page Elements */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <div className="h-1 w-3/4 bg-[#27272A] rounded-full" />
                <div className="h-1 w-1/2 bg-[#27272A]/70 rounded-full" />
                <div className="h-1.5 w-1/3 bg-[#6366F1]/30 rounded-full" />
              </div>
              <div className="w-8 h-5 bg-[#1F1F24] border border-[#2E2E33] rounded flex items-center justify-center p-0.5 shrink-0">
                <Sparkles size={8} className="text-[#6366F1]/60 animate-pulse" />
              </div>
            </div>
          </div>
        ) : (
          /* STYLIZED STREET MAP RADAR FOR HIGH CONCERN OUTREACH */
          <div className={`absolute inset-0 p-3 flex flex-col justify-between bg-gradient-to-br ${visuals.gradient}`}>
            <div className="flex items-center justify-between z-10">
              <div className="flex gap-1 items-center">
                <Navigation size={10} className="text-red-500 animate-pulse" />
                <span className="text-[7px] text-[#71717A] tracking-wider font-mono">MAP LOCATOR</span>
              </div>
              <span className="bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 text-[7px] font-extrabold tracking-widest px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                <span className="text-[10px] leading-none">{visuals.icon}</span> {visuals.label}
              </span>
            </div>

            {/* Abstract street block graphic */}
            <div className="absolute inset-x-0 top-10 bottom-6 px-4 py-1 opacity-25 flex flex-col gap-1 select-none pointer-events-none">
              <div className="flex gap-2 h-1/2">
                <div className="flex-1 border border-[#3F3F46] rounded-sm" />
                <div className="w-1/3 border border-[#3F3F46] rounded-sm" />
              </div>
              <div className="flex gap-1 h-1/2">
                <div className="w-1/4 border border-[#3F3F46] rounded-sm" />
                <div className="flex-1 border border-[#3F3F46] rounded-sm" />
              </div>
            </div>

            {/* Pulsing center target node */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="relative flex h-6 w-6">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-20"></span>
                <span className="relative top-2 left-2 inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            </div>

            {/* Street coordinates address badge */}
            <div className="bg-[#181212] border border-[#3F2B2B] text-[8px] text-[#A1A1AA] rounded-md px-2 py-0.5 flex items-center gap-1 w-full truncate mt-auto z-10">
              <MapPin size={9} className="text-red-400 shrink-0" />
              <span className="truncate">{lead.address || lead.city || 'No precise physical coordinates'}</span>
            </div>
          </div>
        )}
      </div>

      {/* CARD DETAILS BODY */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div className="space-y-3">
          {/* Title & Classification badge */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-xs font-bold text-[#F5F5F5] group-hover:text-white transition line-clamp-2 leading-snug">
                {lead.businessName}
              </h4>
            </div>
            
            {/* Rating */}
            {lead.rating && (
              <div className="flex items-center gap-1 mt-1 text-[9px] text-[#F59E0B] font-bold">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, idx) => (
                    <Star 
                      key={idx} 
                      size={8} 
                      fill={idx < Math.floor(lead.rating || 0) ? '#F59E0B' : 'none'} 
                      className={idx < Math.floor(lead.rating || 0) ? 'text-[#F59E0B]' : 'text-[#3F3F46]'}
                    />
                  ))}
                </div>
                <span>{lead.rating}</span>
              </div>
            )}
          </div>

          {/* Business Info Grid */}
          <div className="space-y-1.5 text-[10px] text-[#A1A1AA] font-sans">
            <div className="flex items-center gap-2">
              <Phone size={11} className="text-[#3F3F46] shrink-0" />
              {lead.phone ? (
                <button 
                  onClick={handleCopyPhone}
                  className="hover:text-indigo-400 font-mono transition text-left focus:outline-none"
                  title="Click to copy number"
                >
                  {copiedPhone ? 'Copied Number!' : lead.phone}
                </button>
              ) : (
                <span className="text-[#52525B] italic font-mono">No contact number</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <MapPin size={11} className="text-[#3F3F46] shrink-0" />
              <span className="truncate" title={lead.address || ''}>
                {lead.city || 'Ontario, CA'}
              </span>
            </div>

            {lead.sector && (
              <div className="flex items-center gap-2">
                <Sparkles size={11} className="text-[#3F3F46] shrink-0" />
                <span className="truncate capitalize text-zinc-400 font-medium">
                  {lead.sector.replace(/_/g, ' ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card bottom actions */}
        <div className="pt-3.5 mt-4 border-t border-[#1C1C1F] flex items-center justify-between gap-2.5">
          {lead.website ? (
            <a 
              href={lead.website} 
              target="_blank" 
              rel="noreferrer" 
              className="flex items-center gap-1 text-[9px] text-[#6366F1] hover:text-[#818CF8] font-bold tracking-wider uppercase transition-colors"
            >
              WEBSITE <ExternalLink size={9} />
            </a>
          ) : (
            <span className="flex items-center gap-1 text-[9px] text-[#52525B] font-bold uppercase select-none">
              OFFLINE <EyeOff size={9} />
            </span>
          )}

          {lead.sentToClose ? (
            <div className="flex items-center gap-1 text-[#10B981] font-bold text-[8px] tracking-widest uppercase select-none bg-[#10B981]/5 px-2.5 py-1 border border-[#10B981]/20 rounded-md">
              <CheckCircle size={9} /> SYNCED
            </div>
          ) : (
            <button 
              onClick={() => onPushLead(lead.leadId)}
              disabled={isPushing}
              className="px-2.5 py-1.5 bg-[#1C1C22] hover:bg-[#6366F1] text-[#A1A1AA] hover:text-white border border-[#27272A] hover:border-[#6366F1] disabled:opacity-40 text-[8px] font-extrabold tracking-widest uppercase rounded transition cursor-pointer"
            >
              {isPushing ? 'SYNCING...' : 'SYNC CRM'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
