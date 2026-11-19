import { manageView } from '#lib/domain/manageview.ts';
import { officeView } from '#lib/domain/officeview.ts';
import { careerView } from '#lib/domain/view.ts';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ data }) => {
	const view = careerView(data.career, data.results);
	const manage = manageView(data.career, view);
	return { ...data, view, manage, office: officeView(data.career, view, manage) };
};
