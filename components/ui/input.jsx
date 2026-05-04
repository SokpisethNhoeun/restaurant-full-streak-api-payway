"use client";

import { Children, isValidElement } from "react";
import { DatePicker as HeroDatePicker, Select as HeroSelect, SelectItem } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { cn } from "@/lib/utils";

const EMPTY_SELECT_KEY = "__happyboat_empty__";

function selectKeyFromValue(value) {
  return value === "" || value == null ? EMPTY_SELECT_KEY : String(value);
}

function valueFromSelectKey(key) {
  return key === EMPTY_SELECT_KEY ? "" : String(key ?? "");
}

function inputChangeEvent(name, value) {
  return {
    target: { name, value },
    currentTarget: { name, value }
  };
}

function parseDateValue(value) {
  if (!value) return null;
  try {
    return parseDate(String(value));
  } catch {
    return null;
  }
}

function optionFromChild(child) {
  if (!isValidElement(child)) return null;
  const rawValue = child.props.value ?? child.props.children;
  const key = selectKeyFromValue(rawValue);
  const label = child.props.children;
  return {
    key,
    label,
    textValue: typeof label === "string" ? label : String(rawValue ?? ""),
    isDisabled: Boolean(child.props.disabled)
  };
}

export function Input({
  className,
  defaultValue,
  disabled,
  max,
  min,
  name,
  onChange,
  placeholder,
  required,
  type,
  value,
  ...props
}) {
  if (type === "date") {
    const dateValue = value === undefined ? undefined : parseDateValue(value);
    const defaultDateValue =
      value === undefined && defaultValue !== undefined ? parseDateValue(defaultValue) : undefined;

    return (
      <HeroDatePicker
        aria-label={props["aria-label"] || placeholder || name || "Date"}
        className="w-full"
        classNames={{
          base: "w-full",
          inputWrapper: cn(
            "h-10 min-h-10 rounded-md border border-input bg-card px-3 py-2 shadow-none outline-none transition group-data-[focus=true]:border-primary group-data-[focus=true]:ring-2 group-data-[focus=true]:ring-primary/20",
            className
          ),
          input: "text-sm text-foreground",
          segment: "text-sm text-foreground data-[editable=true]:text-foreground",
          selectorButton: "text-muted-foreground",
          selectorIcon: "text-muted-foreground",
          popoverContent: "rounded-md border border-border bg-card text-foreground shadow-lg",
          calendar: "bg-card text-foreground",
          calendarContent: "bg-card text-foreground",
        }}
        defaultValue={defaultDateValue}
        granularity="day"
        isDisabled={disabled}
        isRequired={required}
        maxValue={parseDateValue(max) || undefined}
        minValue={parseDateValue(min) || undefined}
        name={name}
        onChange={(nextValue) => onChange?.(inputChangeEvent(name, nextValue?.toString() || ""))}
        radius="sm"
        showMonthAndYearPickers
        size="sm"
        value={dateValue}
        variant="bordered"
        {...props}
      />
    );
  }

  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        className
      )}
      defaultValue={defaultValue}
      disabled={disabled}
      max={max}
      min={min}
      name={name}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      type={type}
      value={value}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  defaultValue,
  disabled,
  name,
  onChange,
  placeholder,
  required,
  value,
  ...props
}) {
  const options = Children.toArray(children).map(optionFromChild).filter(Boolean);
  const selectedKeys = value === undefined ? undefined : new Set([selectKeyFromValue(value)]);
  const defaultSelectedKeys =
    value === undefined && defaultValue !== undefined
      ? new Set([selectKeyFromValue(defaultValue)])
      : undefined;

  const handleSelectionChange = (keys) => {
    const selectedKey = keys === "all" ? options[0]?.key : Array.from(keys || [])[0];
    const nextValue = valueFromSelectKey(selectedKey);
    onChange?.(inputChangeEvent(name, nextValue));
  };

  return (
    <HeroSelect
      aria-label={props["aria-label"] || placeholder || name || "Select"}
      className="w-full"
      classNames={{
        base: "w-full",
        trigger: cn(
          "h-10 min-h-10 rounded-md border border-input bg-card px-3 py-2 shadow-none outline-none transition data-[hover=true]:bg-card data-[open=true]:border-primary data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-primary/20",
          className
        ),
        value: "text-sm text-foreground",
        selectorIcon: "text-muted-foreground",
        popoverContent: "rounded-md border border-border bg-card text-foreground shadow-lg",
        listbox: "bg-card text-foreground",
      }}
      defaultSelectedKeys={defaultSelectedKeys}
      disallowEmptySelection={Boolean(required)}
      isDisabled={disabled}
      isRequired={required}
      name={name}
      onSelectionChange={handleSelectionChange}
      placeholder={placeholder}
      radius="sm"
      selectedKeys={selectedKeys}
      size="sm"
      variant="bordered"
      {...props}
    >
      {options.map((option) => (
        <SelectItem key={option.key} isDisabled={option.isDisabled} textValue={option.textValue}>
          {option.label}
        </SelectItem>
      ))}
    </HeroSelect>
  );
}
