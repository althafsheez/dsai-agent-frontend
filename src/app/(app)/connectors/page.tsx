import { redirect } from "next/navigation";

export default async function LegacyConnectorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, item);
    }
  }

  const query = params.toString();
  redirect(query ? `/extensions?${query}` : "/extensions");
}
