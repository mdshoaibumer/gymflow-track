import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  customFieldService,
  type CreateCustomFieldPayload,
  type UpdateCustomFieldPayload,
} from "@/services/custom-field.service";

export function useCustomFields() {
  return useQuery({
    queryKey: ["custom-fields"],
    queryFn: () => customFieldService.list(),
  });
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCustomFieldPayload) => customFieldService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      toast.success("Custom field created");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomFieldPayload }) =>
      customFieldService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      toast.success("Custom field updated");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFieldService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
      toast.success("Custom field removed");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
