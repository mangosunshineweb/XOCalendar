export type AvailabilityStatus = "available" | "late" | "unavailable";

export type MemberProfile = {
  id: string;
  display_name: string | null;
};

export type TeamMemberRow = {
  user_id: string;
  role: string;
  profiles: MemberProfile | MemberProfile[] | null;
};

export type WeeklyAvailabilityRow = {
  id: string;
  user_id: string;
  practice_date: string;
  status: AvailabilityStatus;
  note: string | null;
};

export type ExtraAvailabilityRow = {
  id: string;
  user_id: string;
  available_date: string;
  start_at: string;
  end_at: string;
  note: string | null;
  profiles: MemberProfile | MemberProfile[] | null;
};

export type TeamMatchRow = {
  id: string;
  team_id: string;
  created_by: string;
  match_date: string;
  start_at: string;
  opponent: string;
  note: string | null;
  created_at: string;
};
