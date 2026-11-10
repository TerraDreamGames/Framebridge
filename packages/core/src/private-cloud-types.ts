/** Server-owned scopes shared by private metadata/PNG features. No credentials. */
export type ReviewScope = {
  kind: "personal" | "group";
  id: string;
  label: string;
};
export type ReviewVersion = { generation: string; revision: number };
