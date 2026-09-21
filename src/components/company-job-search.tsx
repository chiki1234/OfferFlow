import Form from "next/form";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";

export function CompanyJobSearchField(props: ComponentProps<"input">) {
  return <label className="company-job-search-field">
    <Search size={17} aria-hidden="true" />
    <input aria-label="搜索公司名称或岗位名称" type="search" placeholder="搜索公司 / 岗位" {...props} />
  </label>;
}

export function CompanyJobSearch() {
  return <Form action="/jobs" className="company-job-search" role="search">
    <CompanyJobSearchField name="q" />
    <button type="submit" className="primary-button">搜索</button>
  </Form>;
}
