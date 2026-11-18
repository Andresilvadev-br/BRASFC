import { manageView } from '#lib/domain/manageview.ts';
import { careerView } from '#lib/domain/view.ts';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ data }) => {
	const view = careerView(data.career, data.results);
	return { ...data, view, manage: manageView(data.career, view) };
};
