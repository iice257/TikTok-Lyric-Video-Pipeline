"use client";

import { Music2 } from "lucide-react";

import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function IntakePage() {
  return (
    <Shell title="Song Intake" subtitle="Use the right-side slide-in overlay to submit tracks.">
      <Card className="max-w-xl border-border bg-card/70">
        <CardHeader>
          <CardTitle>Song Intake Moved to Overlay</CardTitle>
          <CardDescription>Open intake from the top action row or sidebar to submit assets.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="uppercase">
            <Music2 className="size-4" />
            Use Song Intake Trigger
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}
