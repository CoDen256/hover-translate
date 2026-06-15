import { FC } from "react";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import { PageSkeleton } from "@/shared/ui/Skeletons/PageSkeleton.tsx";

export const DebugPageSkeleton: FC = () => {
  return (
    <PageSkeleton>
      <Stack spacing={2}>
        <Skeleton variant="rounded" width="100%" height={40} />
        <Skeleton variant="rounded" width="100%" height={56} />
        <Skeleton variant="rounded" width="100%" height={32} />
        <Skeleton variant="rounded" width="100%" height={300} />
      </Stack>
    </PageSkeleton>
  );
};