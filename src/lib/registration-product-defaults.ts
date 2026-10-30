type Fields = { customerName: string; locationName: string };

export function resolveRegistrationProductFields(input: {
  current: Fields;
  customerManual: boolean;
  locationManual: boolean;
  suggestedCustomer: string | null;
  suggestedLocation: string | null;
  locationForCustomer: (customer: string) => string | null | undefined;
}): Fields {
  const customerName = input.customerManual ? input.current.customerName : (input.suggestedCustomer ?? "");
  const locationName = input.locationManual ? input.current.locationName : customerName
    ? input.locationForCustomer(customerName) ?? (input.customerManual ? "" : input.suggestedLocation ?? "")
    : input.suggestedLocation ?? "";
  return { customerName, locationName };
}
