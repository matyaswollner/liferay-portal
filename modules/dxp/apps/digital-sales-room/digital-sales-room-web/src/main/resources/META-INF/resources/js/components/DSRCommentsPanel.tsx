/**
 * SPDX-FileCopyrightText: (c) 2025 Liferay, Inc. https://liferay.com
 * SPDX-License-Identifier: LGPL-2.1-or-later OR LicenseRef-Liferay-DXP-EULA-2.0.0-2023-06
 */

import ClayButton, {ClayButtonWithIcon} from '@clayui/button';
import {ClayDropDownWithItems} from '@clayui/drop-down';
import ClayEmptyState from '@clayui/empty-state';
import {ClayInput} from '@clayui/form';
import ClayIcon from '@clayui/icon';
import Sticker from '@clayui/sticker';
import classNames from 'classnames';
import {openToast} from 'frontend-js-components-web';
import React, {useEffect, useState} from 'react';

import '../../css/main.scss';
import DigitalSalesRoomService, {
	TCommentDTO,
} from '../commons/DigitalSalesRoomService';

function toastSuccess() {
	openToast({
		message: Liferay.Language.get('your-request-completed-successfully'),
		type: 'success',
	});
}

function toastError(error: any) {
	openToast({
		message: (error as Error).message,
		type: 'danger',
	});
}

function formatDate(date: string, languageTag: string): string {
	return (
		date &&
		languageTag &&
		Intl.DateTimeFormat(languageTag.replace(/_.*/, ''), {
			day: 'numeric',
			hour: 'numeric',
			hour12: true,
			minute: 'numeric',
			month: 'short',
			year: 'numeric',
		}).format(new Date(date))
	);
}

function DSRCommentsPanel({roomId}: {roomId: number}) {
	const [comments, setComments] = useState<Array<TCommentDTO>>([]);

	const [editingCommentId, setEditingCommentId] = useState<number | null>(
		null
	);

	const [page, setPage] = useState(1);
	const [reload, setReload] = useState(0);
	const [showLoadMore, setShowLoadMore] = useState(false);

	useEffect(() => {
		DigitalSalesRoomService.getComments(roomId, page)
			.then((data) => {
				setComments((prevState) => {
					if (page === 1) {
						return data.items;
					}

					return prevState.concat(data.items);
				});
				setShowLoadMore(page < data.lastPage);
			})
			.catch((error) => {
				openToast({
					message: (error as Error).message,
					type: 'danger',
				});
			});
	}, [page, reload, roomId]);

	const handleDeleteComment = async (commentId: number) => {
		try {
			const response =
				await DigitalSalesRoomService.deleteDigitalSalesRoomComment(
					roomId,
					commentId
				);

			if (response.error) {
				throw new Error(response.error);
			}

			toastSuccess();

			setComments((prevState) =>
				prevState.filter((item) => item.id !== commentId)
			);
			setPage((prevPage) => {
				if (prevPage !== 1) {
					return 1;
				}
				else {
					setReload((prev) => prev + 1);

					return prevPage;
				}
			});
		}
		catch (error) {
			toastError(error);
		}
	};

	const handleEditComment = async (text: string, id: number) => {
		try {
			const data =
				await DigitalSalesRoomService.patchDigitalSalesRoomComment(
					id,
					roomId,
					text
				);

			setComments((prevState) =>
				prevState.map((item) => (item.id === id ? data : item))
			);

			toastSuccess();

			return data;
		}
		catch (error) {
			toastError(error);

			throw error;
		}
	};

	const handleSaveComment = async (comment: string, roomId: number) => {
		try {
			const data =
				await DigitalSalesRoomService.postDigitalSalesRoomComment(
					roomId,
					comment
				);

			setComments((prevState) => {
				const newLength = prevState.length + 1;

				if (newLength <= 20 || page > 1) {
					return [data, ...prevState];
				}
				else {
					setReload((prev) => prev + 1);

					return prevState;
				}
			});

			toastSuccess();
		}
		catch (error) {
			toastError(error);
		}
	};

	return (
		<>
			<div className="dsr-comments-content">
				{comments.length ? (
					<ul className="p-0">
						{comments.map((comment) => (
							<DSRCommentNode
								comment={comment}
								editingCommentId={editingCommentId}
								isChild={false}
								key={comment.id}
								onDelete={handleDeleteComment}
								onEdit={handleEditComment}
								roomId={roomId}
								setEditingCommentId={setEditingCommentId}
							/>
						))}
					</ul>
				) : (
					<ClayEmptyState
						description={Liferay.Language.get(
							'sorry,-no-results-were-found'
						)}
						imgSrc={
							Liferay.ThemeDisplay.getPathThemeImages() +
							'/states/search_state.svg'
						}
						title={Liferay.Language.get('no-results-found')}
					/>
				)}

				{showLoadMore && (
					<ClayButton
						className="btn-block"
						data-qa-id="loadMoreButton"
						displayType="secondary"
						onClick={() => {
							setPage((prev) => prev + 1);
						}}
						size="sm"
					>
						{Liferay.Language.get('load-more')}
					</ClayButton>
				)}
			</div>
			<DSRCommentEditor
				commentText=""
				isChildEditor={false}
				onSubmit={(comment) => handleSaveComment(comment, roomId)}
			/>
		</>
	);
}

function DSRCommentNode({
	comment,
	editingCommentId,
	isChild,
	onDelete,
	onEdit,
	roomId,
	setEditingCommentId,
}: {
	comment: TCommentDTO;
	isChild: boolean;
	onDelete: (commentId: number) => Promise<void>;
	onEdit: (text: string, commentId: number) => Promise<TCommentDTO>;
	roomId: number;
	editingCommentId: number | null;
	setEditingCommentId: (id: number | null) => void;
}) {
	type Status = 'empty' | 'show' | 'show-more';

	const isOwner =
		comment.creator.id === Number(Liferay.ThemeDisplay.getUserId());

	const [showReplies, setShowReplies] = useState(false);
	const [replies, setReplies] = useState<Array<TCommentDTO>>([]);
	const [showReplyForm, setShowReplyForm] = useState(false);
	const [page, setPage] = useState(1);
	const [buttonStatus, setButtonStatus] = useState<Status>(
		comment.numberOfComments > 0 ? 'show' : 'empty'
	);
	const [reload, setReload] = useState(0);
	const isEditing = editingCommentId === comment.id;

	const handleSaveReply = async (
		text: string,
		parentCommentId: number,
		roomId: number
	) => {
		try {
			const data =
				await DigitalSalesRoomService.postDigitalSalesRoomComment(
					roomId,
					text,
					parentCommentId
				);
			const newLength = replies.length + 1;

			if (showReplies) {
				setReplies((prevState) => {
					if (newLength <= 5 || page > 1) {
						return [data, ...prevState];
					}
					else {
						setReload((prev) => prev + 1);

						return prevState;
					}
				});
			}
			else {
				setShowReplies(true);
			}

			setShowReplyForm(false);

			if (newLength > 5) {
				setButtonStatus('show-more');
			}
			else {
				setButtonStatus('empty');
			}

			toastSuccess();
		}
		catch (error) {
			toastError(error);
		}
	};

	const handleDeleteReply = async (replyId: number) => {
		await onDelete(replyId);

		setReplies((prev) => prev.filter((reply) => reply.id !== replyId));

		setPage((prevPage) => {
			if (prevPage !== 1) {
				return 1;
			}
			else {
				setReload((prev) => prev + 1);

				return prevPage;
			}
		});
	};

	const handleEditReply = async (text: string, commentId: number) => {
		const data = await onEdit(text, commentId);

		setReplies((prevState) => {
			return prevState.map((item) =>
				item.id === commentId ? data : item
			);
		});

		toastSuccess();

		return data;
	};

	useEffect(() => {
		if (!showReplies) {
			return;
		}

		DigitalSalesRoomService.getComments(roomId, page, 5, comment.id)
			.then((data) => {
				setReplies((prevState) => {
					if (page === 1) {
						return data.items;
					}

					return prevState.concat(data.items);
				});
				if (page < data.lastPage) {
					setButtonStatus('show-more');
				}
				else {
					setButtonStatus('empty');
				}
			})
			.catch((error) => {
				openToast({
					message: (error as Error).message,
					type: 'danger',
				});
			});
	}, [showReplies, roomId, comment.id, page, reload]);

	return (
		<>
			<li
				className={classNames('list-unstyled pb-3', {
					'border-bottom': !isChild,
					'dsr-comment-child': isChild,
				})}
			>
				<article>
					<div className="autofit-padded autofit-row mb-1 pt-2">
						<div className="pl-0 pt-1">
							<Sticker shape="user-icon">
								{comment.creator.image ? (
									<Sticker.Image
										alt={comment.creator.name}
										src={comment.creator.image}
									/>
								) : (
									<ClayIcon symbol="user" />
								)}
							</Sticker>
						</div>

						<header className="autofit-col autofit-col-expand">
							<span className="list-group-title">
								{comment.creator.name}
							</span>

							<time className="list-group-text text-3">
								{formatDate(
									comment.dateCreated,
									Liferay.ThemeDisplay.getLanguageId()
								)}
							</time>
						</header>

						{isOwner && !isEditing && (
							<ClayDropDownWithItems
								items={[
									{
										label: Liferay.Language.get('edit'),
										onClick: () =>
											setEditingCommentId(comment.id),
										symbolLeft: 'pencil',
									},
									{
										label: Liferay.Language.get('delete'),
										onClick: async () =>
											await onDelete(comment.id),
										symbolLeft: 'trash',
									},
								]}
								menuWidth="shrink"
								trigger={
									<ClayButtonWithIcon
										borderless
										data-qa-id="comment-actions"
										displayType="secondary"
										monospaced
										size="xs"
										symbol="ellipsis-v"
										title={Liferay.Language.get('actions')}
									/>
								}
							/>
						)}
					</div>

					{isEditing ? (
						<DSRCommentEditor
							commentText={comment.text}
							isChildEditor
							onCancel={() => setEditingCommentId(null)}
							onSubmit={async (text) => {
								if (isChild) {
									await handleEditReply(text, comment.id);
								}
								else {
									await onEdit(text, comment.id);
								}

								setEditingCommentId(null);
							}}
						/>
					) : (
						<pre className="dsr-comment-body my-3 text-3">
							{comment.text}
						</pre>
					)}
				</article>

				{!isChild && (
					<ClayButton
						borderless
						displayType="secondary"
						onClick={() => setShowReplyForm(true)}
						size="xs"
					>
						{Liferay.Language.get('reply')}
					</ClayButton>
				)}

				{showReplies && !!replies.length ? (
					<ul className="pl-0">
						{replies.map((child: TCommentDTO) => (
							<DSRCommentNode
								comment={child}
								editingCommentId={editingCommentId}
								isChild
								key={child.id}
								onDelete={handleDeleteReply}
								onEdit={handleEditReply}
								roomId={roomId}
								setEditingCommentId={setEditingCommentId}
							/>
						))}
					</ul>
				) : null}

				{buttonStatus === 'show' && (
					<ClayButton
						className="btn-block"
						data-qa-id="showRepliesButton"
						displayType="secondary"
						onClick={() => setShowReplies(true)}
						size="xs"
					>
						Show replies
					</ClayButton>
				)}

				{buttonStatus === 'show-more' && (
					<ClayButton
						className="btn-block"
						data-qa-id="showMoreRepliesButton"
						displayType="secondary"
						onClick={() => setPage((prev) => prev + 1)}
						size="xs"
					>
						Show more replies
					</ClayButton>
				)}

				{showReplyForm && (
					<DSRCommentEditor
						commentText=""
						isChildEditor
						onCancel={() => setShowReplyForm(false)}
						onSubmit={(childComment) =>
							handleSaveReply(childComment, comment.id, roomId)
						}
					/>
				)}
			</li>
		</>
	);
}

function DSRCommentEditor({
	commentText,
	isChildEditor,
	onCancel,
	onSubmit,
}: {
	commentText: string;
	isChildEditor: boolean;
	onSubmit: (comment: string) => Promise<void>;
	onCancel?: () => void;
}) {
	const [comment, setComment] = useState(commentText);
	const [disabled, setDisabled] = useState<boolean>(false);

	useEffect(() => {
		setComment(commentText);
	}, [commentText]);

	return (
		<div
			className={classNames('dsr-comment-editor', {
				'dsr-comment-editor--fixed': !isChildEditor,
				'dsr-comment-editor--inline': isChildEditor,
			})}
		>
			{!isChildEditor && (
				<div className="py-2">
					<strong>{Liferay.Language.get('add-comment')}</strong>
				</div>
			)}

			<ClayInput
				className="form-control form-control-sm"
				component="textarea"
				data-qa-id={
					isChildEditor ? 'editCommentTextarea' : 'commentTextarea'
				}
				onChange={(event) => {
					setComment(event.target.value);
				}}
				placeholder={Liferay.Language.get('type-your-comment-here')}
				value={comment}
			></ClayInput>

			<div className="my-3">
				<ClayButton
					data-qa-id={isChildEditor ? 'editSave' : 'createSave'}
					disabled={disabled || !comment.trim()}
					onClick={async () => {
						setDisabled(true);
						try {
							await onSubmit(comment.trim());
							setComment('');
						}
						finally {
							setDisabled(false);
						}
					}}
					size="sm"
				>
					{Liferay.Language.get('save')}
				</ClayButton>

				<ClayButton
					borderless
					className="ml-1"
					displayType="secondary"
					onClick={() => {
						setComment('');
						onCancel?.();
					}}
					size="sm"
				>
					{Liferay.Language.get('cancel')}
				</ClayButton>
			</div>
		</div>
	);
}

export default DSRCommentsPanel;
