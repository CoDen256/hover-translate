import { FC } from "react";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import { PageSkeleton } from "@/shared/ui/Skeletons/PageSkeleton.tsx";

export const SyncPageSkeleton: FC = () => {
  return (
    <PageSkeleton>
      <Stack spacing={2}>
        <Skeleton variant="rounded" width="100%" height={40} />
        <Skeleton variant="rounded" width="100%" height={40} />
        <Skeleton variant="rounded" width={120} height={36} />
      </Stack>
    </PageSkeleton>
  );
};
