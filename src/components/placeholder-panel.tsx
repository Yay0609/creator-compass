import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** 统一「本阶段未实现」占位卡片，避免各页面各写一套。 */
export function PlaceholderPanel({
  stage,
  title,
  description,
  items,
}: {
  stage: string;
  title: string;
  description: string;
  items?: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant="secondary">{stage} 实现</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {items && items.length > 0 ? (
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}